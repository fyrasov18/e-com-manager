import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { requirePermission, type CurrentUser } from "@/lib/api-auth";
import {
  META_ADS_CATEGORY,
  META_ADS_SOURCE,
  parseMetaAdsBillingCsv,
  parsePositiveNumber,
} from "@/lib/expenses";

const MAX_CSV_SIZE_BYTES = 2 * 1024 * 1024;

async function getTeamId(user: CurrentUser) {
  return user.teamId ?? getOrCreateDefaultTeamId();
}

function isCsvFile(file: File) {
  return (
    file.name.toLowerCase().endsWith(".csv") ||
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel"
  );
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("expenses:write");
    if (auth.response) return auth.response;

    const teamId = await getTeamId(auth.user);
    const formData = await request.formData();
    const fileValue = formData.get("file");
    const exchangeRate = parsePositiveNumber(formData.get("exchangeRate"));

    if (!(fileValue instanceof File)) {
      return NextResponse.json({ error: "Fichier CSV requis." }, { status: 400 });
    }

    if (!isCsvFile(fileValue)) {
      return NextResponse.json(
        { error: "Le fichier doit être un export CSV Meta Ads." },
        { status: 400 }
      );
    }

    if (fileValue.size > MAX_CSV_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Le fichier CSV ne doit pas dépasser 2 Mo." },
        { status: 400 }
      );
    }

    if (!exchangeRate) {
      return NextResponse.json(
        { error: "Le taux USD-TND est requis et doit être supérieur à 0." },
        { status: 400 }
      );
    }

    const csvText = await fileValue.text();
    const parsed = parseMetaAdsBillingCsv(csvText, exchangeRate);

    if (!parsed.dailyImports.length) {
      return NextResponse.json(
        {
          error: "Aucune dépense Meta Ads valide à importer.",
          skipped: parsed.skipped,
          errors: parsed.errors.slice(0, 20),
        },
        { status: 400 }
      );
    }

    const externalIds = parsed.dailyImports.map((day) => day.externalId);
    const existingImports = await prisma.expense.findMany({
      where: {
        teamId,
        source: META_ADS_SOURCE,
        externalId: { in: externalIds },
      },
      select: { externalId: true },
    });
    const existingExternalIds = new Set(
      existingImports
        .map((expense) => expense.externalId)
        .filter((externalId): externalId is string => Boolean(externalId))
    );

    const expenses = await prisma.$transaction(
      parsed.dailyImports.map((day) =>
        prisma.expense.upsert({
          where: {
            expense_import_identity: {
              teamId,
              source: META_ADS_SOURCE,
              externalId: day.externalId,
            },
          },
          create: {
            name: "Meta Ads",
            amount: day.amountTnd,
            amountUsd: day.amountUsd,
            exchangeRate: day.exchangeRate,
            amountTnd: day.amountTnd,
            type: "ONE_TIME",
            frequency: null,
            startDate: day.date,
            category: META_ADS_CATEGORY,
            description: day.description,
            source: META_ADS_SOURCE,
            externalId: day.externalId,
            metadata: day.metadata as Prisma.InputJsonValue,
            createdById: auth.user.id,
            teamId,
          },
          update: {
            name: "Meta Ads",
            amount: day.amountTnd,
            amountUsd: day.amountUsd,
            exchangeRate: day.exchangeRate,
            amountTnd: day.amountTnd,
            type: "ONE_TIME",
            frequency: null,
            startDate: day.date,
            category: META_ADS_CATEGORY,
            description: day.description,
            source: META_ADS_SOURCE,
            metadata: day.metadata as Prisma.InputJsonValue,
            createdById: auth.user.id,
            isActive: true,
          },
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        })
      )
    );

    const updated = parsed.dailyImports.filter((day) =>
      existingExternalIds.has(day.externalId)
    ).length;
    const imported = parsed.dailyImports.length - updated;

    return NextResponse.json({
      imported,
      updated,
      skipped: parsed.skipped,
      totalUsd: parsed.totalUsd,
      totalTnd: parsed.totalTnd,
      errors: parsed.errors.slice(0, 20),
      expenses,
    });
  } catch (err) {
    console.error("[Expense] Meta Ads CSV import error:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'import CSV Meta Ads." },
      { status: 500 }
    );
  }
}
