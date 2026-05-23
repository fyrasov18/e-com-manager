import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

export async function GET(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const priority = searchParams.get("priority");
    const filter = searchParams.get("filter"); // today | overdue | done | pending

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999);

    const where: any = { teamId };

    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;

    if (filter === "today") {
      where.dueDate = { gte: todayStart, lte: todayEnd };
    } else if (filter === "overdue") {
      where.dueDate = { lt: todayStart };
      where.status = { not: "DONE" };
    } else if (filter === "done") {
      where.status = "DONE";
    } else if (filter === "pending") {
      where.status = { not: "DONE" };
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    });

    // Stats
    const allTasks = await prisma.task.findMany({ where: { teamId } });
    const stats = {
      today: allTasks.filter(t => t.dueDate && t.dueDate >= todayStart && t.dueDate <= todayEnd).length,
      done: allTasks.filter(t => t.status === "DONE").length,
      overdue: allTasks.filter(t => t.dueDate && t.dueDate < todayStart && t.status !== "DONE").length,
      reminders: allTasks.filter(t => t.reminderEnabled && t.status !== "DONE").length,
    };

    return NextResponse.json({ tasks, stats });
  } catch (err) {
    console.error("[Tasks GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();
    const { title, description, category, priority, status, dueDate, reminderAt, repeat, reminderEnabled } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Le titre est requis" }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        category: category || "OTHER",
        priority: priority || "MEDIUM",
        status: status || "TODO",
        dueDate: dueDate ? new Date(dueDate) : null,
        reminderAt: reminderAt ? new Date(reminderAt) : null,
        repeat: repeat || "NONE",
        reminderEnabled: reminderEnabled !== false,
        team: { connect: { id: teamId } },
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("[Tasks POST]", err);
    return NextResponse.json({ error: "Erreur création tâche" }, { status: 500 });
  }
}
