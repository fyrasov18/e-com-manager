import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { getGoalsWithMetrics } from "@/lib/goals";

const GOAL_TYPES = ["REVENUE", "ORDERS", "PROFIT", "EXPENSES", "STOCK", "DELIVERY", "CUSTOM"];
const GOAL_PERIODS = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"];

function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return isNaN(date.getTime()) ? null : date;
}

function getDefaultRange(period: string) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (period) {
    case "DAILY":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "WEEKLY": {
      const day = start.getDay();
      const diff = (day + 6) % 7;
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "MONTHLY":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(start.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "YEARLY":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    default:
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

export async function GET() {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const goals = await getGoalsWithMetrics(teamId);
    return NextResponse.json({ goals });
  } catch (err) {
    console.error("[Goals] GET error:", err);
    return NextResponse.json({ error: "Impossible de charger les objectifs." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await request.json();
    const { title, type, targetValue, period, startDate, endDate, description } = body;

    if (!title || !type || period === undefined || targetValue === undefined) {
      return NextResponse.json({ error: "Champs requis manquants." }, { status: 400 });
    }

    if (!GOAL_TYPES.includes(type)) {
      return NextResponse.json({ error: "Type d'objectif invalide." }, { status: 400 });
    }

    if (!GOAL_PERIODS.includes(period)) {
      return NextResponse.json({ error: "Période invalide." }, { status: 400 });
    }

    const parsedTarget = parseFloat(String(targetValue));
    if (Number.isNaN(parsedTarget) || parsedTarget < 0) {
      return NextResponse.json({ error: "Valeur cible invalide." }, { status: 400 });
    }

    let range = getDefaultRange(period);
    if (period === "CUSTOM") {
      const parsedStart = parseDate(startDate);
      const parsedEnd = parseDate(endDate);
      if (!parsedStart || !parsedEnd) {
        return NextResponse.json({ error: "Dates personnalisées invalides." }, { status: 400 });
      }
      if (parsedEnd < parsedStart) {
        return NextResponse.json({ error: "La date de fin doit être après la date de début." }, { status: 400 });
      }
      range = { start: parsedStart, end: parsedEnd };
    }

    const goal = await prisma.goal.create({
      data: {
        title: String(title).trim(),
        type,
        period,
        targetValue: parsedTarget,
        currentValue: 0,
        status: "ON_TRACK",
        startDate: range.start,
        endDate: range.end,
        description: description ? String(description).trim() : null,
        teamId,
      },
    });

    return NextResponse.json(goal);
  } catch (err) {
    console.error("[Goals] POST error:", err);
    return NextResponse.json({ error: "Erreur lors de la creation de l'objectif." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await request.json();
    const { id, action, title, type, period, targetValue, startDate, endDate, description } = body;

    if (!id) {
      return NextResponse.json({ error: "ID requis." }, { status: 400 });
    }

    const existing = await prisma.goal.findFirst({ where: { id, teamId } });
    if (!existing) {
      return NextResponse.json({ error: "Objectif non trouve." }, { status: 404 });
    }

    if (action === "markAchieved") {
      const updated = await prisma.goal.update({
        where: { id },
        data: { status: "ACHIEVED", currentValue: existing.targetValue },
      });
      return NextResponse.json(updated);
    }

    if (action === "reset") {
      const range = period ? getDefaultRange(period) : getDefaultRange(existing.period);
      const updated = await prisma.goal.update({
        where: { id },
        data: {
          currentValue: 0,
          status: "ON_TRACK",
          startDate: range.start,
          endDate: range.end,
          ...(period ? { period } : {}),
        },
      });
      return NextResponse.json(updated);
    }

    const updateData: Record<string, any> = {};
    if (title !== undefined) updateData.title = title;
    if (type !== undefined && GOAL_TYPES.includes(type)) updateData.type = type;
    if (period !== undefined && GOAL_PERIODS.includes(period)) updateData.period = period;
    if (targetValue !== undefined) {
      const parsedTarget = parseFloat(String(targetValue));
      if (Number.isNaN(parsedTarget) || parsedTarget < 0) {
        return NextResponse.json({ error: "Valeur cible invalide." }, { status: 400 });
      }
      updateData.targetValue = parsedTarget;
    }
    if (startDate !== undefined) {
      const parsed = parseDate(startDate);
      if (parsed) updateData.startDate = parsed;
    }
    if (endDate !== undefined) {
      const parsed = parseDate(endDate);
      if (parsed) updateData.endDate = parsed;
    }
    if (description !== undefined) updateData.description = description;

    const updated = await prisma.goal.update({ where: { id }, data: updateData });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[Goals] PATCH error:", err);
    return NextResponse.json({ error: "Erreur lors de la mise a jour de l'objectif." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID requis." }, { status: 400 });
    }

    const existing = await prisma.goal.findFirst({ where: { id, teamId } });
    if (!existing) {
      return NextResponse.json({ error: "Objectif non trouve." }, { status: 404 });
    }

    await prisma.goal.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Goals] DELETE error:", err);
    return NextResponse.json({ error: "Erreur lors de la suppression de l'objectif." }, { status: 500 });
  }
}
