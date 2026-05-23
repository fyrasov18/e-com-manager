import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const { id } = await params;

    const existing = await prisma.task.findFirst({ where: { id, teamId } });
    if (!existing) return NextResponse.json({ error: "Tâche non trouvée" }, { status: 404 });

    const now = new Date();

    await prisma.task.update({
      where: { id },
      data: { status: "DONE", completedAt: now },
    });

    // Si tâche répétée, créer la prochaine occurrence
    if (existing.repeat !== "NONE" && existing.dueDate) {
      const next = new Date(existing.dueDate);
      if (existing.repeat === "DAILY") next.setDate(next.getDate() + 1);
      else if (existing.repeat === "WEEKLY") next.setDate(next.getDate() + 7);
      else if (existing.repeat === "MONTHLY") next.setMonth(next.getMonth() + 1);

      let nextReminder: Date | null = null;
      if (existing.reminderAt) {
        nextReminder = new Date(existing.reminderAt);
        if (existing.repeat === "DAILY") nextReminder.setDate(nextReminder.getDate() + 1);
        else if (existing.repeat === "WEEKLY") nextReminder.setDate(nextReminder.getDate() + 7);
        else if (existing.repeat === "MONTHLY") nextReminder.setMonth(nextReminder.getMonth() + 1);
      }

      await prisma.task.create({
        data: {
          title: existing.title,
          description: existing.description,
          category: existing.category,
          priority: existing.priority,
          status: "TODO",
          dueDate: next,
          reminderAt: nextReminder,
          repeat: existing.repeat,
          reminderEnabled: existing.reminderEnabled,
          team: { connect: { id: teamId } },
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Task Complete]", err);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
