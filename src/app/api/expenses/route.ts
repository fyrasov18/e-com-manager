import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { requirePermission, type CurrentUser } from "@/lib/api-auth";
import {
  DEFAULT_USD_TND_RATE,
  MANUAL_EXPENSE_SOURCE,
  META_ADS_CATEGORY,
  META_ADS_SOURCE,
  parsePositiveNumber,
  validateMetaAdsExpenseInput,
} from "@/lib/expenses";

const EXPENSE_TYPES = ["RECURRING", "ONE_TIME"] as const;
const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

async function getTeamId(user: CurrentUser) {
  return user.teamId ?? getOrCreateDefaultTeamId();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function startOfNextYear(date: Date) {
  return new Date(date.getFullYear() + 1, 0, 1);
}

function parseDateOnly(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRequestedDateRange(searchParams: URLSearchParams) {
  const period = searchParams.get("period");

  if (period === "today") {
    const start = startOfDay(new Date());
    return { gte: start, lt: addDays(start, 1) };
  }

  if (period === "month") {
    const now = new Date();
    return { gte: startOfMonth(now), lt: startOfNextMonth(now) };
  }

  const from = parseDateOnly(searchParams.get("from"));
  const to = parseDateOnly(searchParams.get("to"));

  if (!from && !to) return undefined;

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lt: addDays(to, 1) } : {}),
  };
}

function buildManualExpenseData(body: Record<string, unknown>, userId: string, teamId: string) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = typeof body.type === "string" ? body.type : "";
  const frequency = typeof body.frequency === "string" ? body.frequency : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const amount = parsePositiveNumber(body.amount);

  if (!name || !amount || !type || !category) {
    return { error: "Champs requis manquants." } as const;
  }

  if (!EXPENSE_TYPES.includes(type as (typeof EXPENSE_TYPES)[number])) {
    return { error: "Type invalide." } as const;
  }

  if (
    type === "RECURRING" &&
    !FREQUENCIES.includes(frequency as (typeof FREQUENCIES)[number])
  ) {
    return { error: "Fréquence invalide." } as const;
  }

  const startDate =
    typeof body.startDate === "string" && body.startDate.trim()
      ? new Date(body.startDate)
      : new Date();

  if (Number.isNaN(startDate.getTime())) {
    return { error: "Date invalide." } as const;
  }

  return {
    data: {
      name,
      amount,
      amountTnd: amount,
      type,
      frequency: type === "RECURRING" ? frequency : null,
      startDate,
      category,
      description: description || null,
      source: MANUAL_EXPENSE_SOURCE,
      createdById: userId,
      teamId,
    },
  } as const;
}

async function getDefaultExchangeRate(teamId: string) {
  const latest = await prisma.expense.findFirst({
    where: {
      teamId,
      source: META_ADS_SOURCE,
      exchangeRate: { not: null },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: { exchangeRate: true },
  });

  return latest?.exchangeRate ?? DEFAULT_USD_TND_RATE;
}

async function getMetaAdsTotals(teamId: string, range?: { gte: Date; lt: Date }) {
  const expenses = await prisma.expense.findMany({
    where: {
      teamId,
      source: META_ADS_SOURCE,
      isActive: true,
      ...(range ? { startDate: range } : {}),
    },
    select: {
      amount: true,
      amountUsd: true,
      amountTnd: true,
    },
  });

  return expenses.reduce(
    (totals, expense) => ({
      usd: totals.usd + (expense.amountUsd ?? 0),
      tnd: totals.tnd + (expense.amountTnd ?? expense.amount ?? 0),
    }),
    { usd: 0, tnd: 0 }
  );
}

async function getMetaAdsSummary(teamId: string) {
  const now = new Date();
  const todayStart = startOfDay(now);

  const [today, month, year, total] = await Promise.all([
    getMetaAdsTotals(teamId, { gte: todayStart, lt: addDays(todayStart, 1) }),
    getMetaAdsTotals(teamId, { gte: startOfMonth(now), lt: startOfNextMonth(now) }),
    getMetaAdsTotals(teamId, { gte: startOfYear(now), lt: startOfNextYear(now) }),
    getMetaAdsTotals(teamId),
  ]);

  return { today, month, year, total };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("expenses:read");
    if (auth.response) return auth.response;

    const teamId = await getTeamId(auth.user);
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source");
    const search = searchParams.get("search")?.trim();

    const where: Prisma.ExpenseWhereInput = { teamId };

    if (source && source !== "ALL") {
      where.source = source;
    }

    const dateRange = getRequestedDateRange(searchParams);
    if (dateRange) {
      where.startDate = dateRange;
    }

    if (search) {
      where.description = { contains: search, mode: "insensitive" };
    }

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const [summary, defaultExchangeRate] = await Promise.all([
      getMetaAdsSummary(teamId),
      getDefaultExchangeRate(teamId),
    ]);

    return NextResponse.json({ expenses, summary, defaultExchangeRate });
  } catch (err) {
    console.error("[Expense] GET error:", err);
    return NextResponse.json(
      { error: "Impossible de charger les dépenses." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("expenses:write");
    if (auth.response) return auth.response;

    const teamId = await getTeamId(auth.user);
    const body = (await request.json()) as Record<string, unknown>;

    if (body.source === META_ADS_SOURCE) {
      const validation = validateMetaAdsExpenseInput(body);
      if (!validation.success) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const expense = await prisma.expense.create({
        data: {
          name: "Meta Ads",
          amount: validation.data.amountTnd,
          amountUsd: validation.data.amountUsd,
          exchangeRate: validation.data.exchangeRate,
          amountTnd: validation.data.amountTnd,
          type: "ONE_TIME",
          frequency: null,
          startDate: validation.data.date,
          category: META_ADS_CATEGORY,
          description: validation.data.note,
          source: META_ADS_SOURCE,
          createdById: auth.user.id,
          teamId,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return NextResponse.json(expense, { status: 201 });
    }

    const result = buildManualExpenseData(body, auth.user.id, teamId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const expense = await prisma.expense.create({
      data: result.data,
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    console.error("[Expense] POST error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la création." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requirePermission("expenses:write");
    if (auth.response) return auth.response;

    const teamId = await getTeamId(auth.user);
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";

    if (!id) {
      return NextResponse.json({ error: "ID requis." }, { status: 400 });
    }

    const existing = await prisma.expense.findFirst({
      where: { id, teamId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Dépense non trouvée." }, { status: 404 });
    }

    const shouldUpdateMetaAds =
      existing.source === META_ADS_SOURCE || body.source === META_ADS_SOURCE;

    if (shouldUpdateMetaAds) {
      const validation = validateMetaAdsExpenseInput({
        date: body.date ?? body.startDate ?? existing.startDate,
        amountUsd: body.amountUsd ?? existing.amountUsd,
        exchangeRate: body.exchangeRate ?? existing.exchangeRate,
        note: body.note ?? body.description ?? existing.description,
      });

      if (!validation.success) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const expense = await prisma.expense.update({
        where: { id },
        data: {
          name: "Meta Ads",
          amount: validation.data.amountTnd,
          amountUsd: validation.data.amountUsd,
          exchangeRate: validation.data.exchangeRate,
          amountTnd: validation.data.amountTnd,
          type: "ONE_TIME",
          frequency: null,
          startDate: validation.data.date,
          category: META_ADS_CATEGORY,
          description: validation.data.note,
          source: META_ADS_SOURCE,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return NextResponse.json(expense);
    }

    const updateData: Prisma.ExpenseUpdateInput = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: "Le nom est requis." }, { status: 400 });
      }
      updateData.name = name;
    }
    if (body.amount !== undefined) {
      const amount = parsePositiveNumber(body.amount);
      if (!amount) {
        return NextResponse.json(
          { error: "Le montant doit être supérieur à 0." },
          { status: 400 }
        );
      }
      updateData.amount = amount;
      updateData.amountTnd = amount;
    }
    if (typeof body.type === "string") {
      if (!EXPENSE_TYPES.includes(body.type as (typeof EXPENSE_TYPES)[number])) {
        return NextResponse.json({ error: "Type invalide." }, { status: 400 });
      }
      updateData.type = body.type;
    }
    if (body.frequency !== undefined) {
      const frequency = typeof body.frequency === "string" ? body.frequency : null;
      if (frequency && !FREQUENCIES.includes(frequency as (typeof FREQUENCIES)[number])) {
        return NextResponse.json({ error: "Fréquence invalide." }, { status: 400 });
      }
      updateData.frequency = frequency;
    }
    if (typeof body.startDate === "string") {
      const startDate = new Date(body.startDate);
      if (Number.isNaN(startDate.getTime())) {
        return NextResponse.json({ error: "Date invalide." }, { status: 400 });
      }
      updateData.startDate = startDate;
    }
    if (typeof body.category === "string") {
      const category = body.category.trim();
      if (!category) {
        return NextResponse.json({ error: "La catégorie est requise." }, { status: 400 });
      }
      updateData.category = category;
    }
    if (body.description !== undefined) {
      updateData.description =
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null;
    }
    if (typeof body.isActive === "boolean") updateData.isActive = body.isActive;

    const expense = await prisma.expense.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(expense);
  } catch (err) {
    console.error("[Expense] PATCH error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePermission("expenses:write");
    if (auth.response) return auth.response;

    const teamId = await getTeamId(auth.user);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID requis." }, { status: 400 });
    }

    const existing = await prisma.expense.findFirst({
      where: { id, teamId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Dépense non trouvée." }, { status: 404 });
    }

    await prisma.expense.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Expense] DELETE error:", err);
    return NextResponse.json(
      { error: "Erreur lors de la suppression." },
      { status: 500 }
    );
  }
}
