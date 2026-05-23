import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.task.findFirst({ where: { id, teamId } });
    if (!existing) return NextResponse.json({ error: "Tâche non trouvée" }, { status: 404 });

    const { title, description, category, priority, status, dueDate, reminderAt, repeat, reminderEnabled } = body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (category !== undefined) updateData.category = category;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) {
      updateData.status = status;
      if (status === "DONE" && existing.status !== "DONE") {
        updateData.completedAt = new Date();
      } else if (status !== "DONE") {
        updateData.completedAt = null;
      }
    }
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (reminderAt !== undefined) updateData.reminderAt = reminderAt ? new Date(reminderAt) : null;
    if (repeat !== undefined) updateData.repeat = repeat;
    if (reminderEnabled !== undefined) updateData.reminderEnabled = reminderEnabled;

    const task = await prisma.task.update({ where: { id }, data: updateData });
    return NextResponse.json({ task });
  } catch (err) {
    console.error("[Tasks PATCH]", err);
    return NextResponse.json({ error: "Erreur mise à jour" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const { id } = await params;

    const existing = await prisma.task.findFirst({ where: { id, teamId } });
    if (!existing) return NextResponse.json({ error: "Tâche non trouvée" }, { status: 404 });

    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Tasks DELETE]", err);
    return NextResponse.json({ error: "Erreur suppression" }, { status: 500 });
  }
}
