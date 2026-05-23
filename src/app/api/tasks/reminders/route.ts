import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

// GET /api/tasks/reminders — returns tasks whose reminder is due now
export async function GET() {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const due = await prisma.task.findMany({
      where: {
        teamId,
        reminderEnabled: true,
        status: { not: "DONE" },
        reminderAt: { lte: now, gte: fiveMinAgo },
        OR: [
          { lastReminderSentAt: null },
          { lastReminderSentAt: { lt: fiveMinAgo } },
        ],
      },
    });

    // Mark as sent
    if (due.length > 0) {
      await prisma.task.updateMany({
        where: { id: { in: due.map(t => t.id) } },
        data: { lastReminderSentAt: now },
      });
    }

    return NextResponse.json({ reminders: due });
  } catch (err) {
    console.error("[Tasks Reminders]", err);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

// POST /api/tasks/[id]/snooze — reporter de 30 min
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json().catch(() => ({}));
    const minutes = body.minutes ?? 30;
    const id = (await params).id;

    const existing = await prisma.task.findFirst({ where: { id, teamId } });
    if (!existing) return NextResponse.json({ error: "Tâche non trouvée" }, { status: 404 });

    const snoozeUntil = new Date((existing.reminderAt ?? new Date()).getTime() + minutes * 60000);

    const task = await prisma.task.update({
      where: { id },
      data: { reminderAt: snoozeUntil, lastReminderSentAt: null },
    });

    return NextResponse.json({ task });
  } catch (err) {
    console.error("[Task Snooze]", err);
    return NextResponse.json({ error: "Erreur snooze" }, { status: 500 });
  }
}
