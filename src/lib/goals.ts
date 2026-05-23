import { prisma } from "@/lib/prisma";
import type { Goal as PrismaGoal } from "@prisma/client";

export type GoalType =
  | "REVENUE"
  | "ORDERS"
  | "PROFIT"
  | "EXPENSES"
  | "STOCK"
  | "DELIVERY"
  | "CUSTOM";

export type GoalPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";

export type GoalStatus = "ON_TRACK" | "BEHIND" | "AHEAD" | "ACHIEVED";

export interface GoalWithMetrics extends PrismaGoal {
  progress: number;
  detail: Record<string, number | string | undefined>;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return startOfDay(d);
}

function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  return endOfDay(d);
}

function startOfMonth(date: Date) {
  const d = new Date(date);
  d.setDate(1);
  return startOfDay(d);
}

function endOfMonth(date: Date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return endOfDay(d);
}

function startOfYear(date: Date) {
  const d = new Date(date);
  d.setMonth(0, 1);
  return startOfDay(d);
}

function endOfYear(date: Date) {
  const d = new Date(date);
  d.setMonth(11, 31);
  return endOfDay(d);
}

export function getRangeForGoal(goal: PrismaGoal) {
  const today = new Date();
  if (goal.period === "CUSTOM") {
    return {
      start: goal.startDate ? startOfDay(new Date(goal.startDate)) : startOfDay(today),
      end: goal.endDate ? endOfDay(new Date(goal.endDate)) : endOfDay(today),
    };
  }

  switch (goal.period) {
    case "DAILY":
      return { start: startOfDay(today), end: endOfDay(today) };
    case "WEEKLY":
      return { start: startOfWeek(today), end: endOfWeek(today) };
    case "MONTHLY":
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case "YEARLY":
      return { start: startOfYear(today), end: endOfYear(today) };
    default:
      return {
        start: goal.startDate ? startOfDay(new Date(goal.startDate)) : startOfDay(today),
        end: goal.endDate ? endOfDay(new Date(goal.endDate)) : endOfDay(today),
      };
  }
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, value));
}

function computeGoalProgress(type: GoalType, currentValue: number, targetValue: number) {
  if (targetValue === 0) return 0;
  if (type === "EXPENSES") {
    return clampProgress(currentValue / targetValue);
  }
  return clampProgress(currentValue / targetValue);
}

function computeGoalStatus(type: GoalType, currentValue: number, targetValue: number, progress: number): GoalStatus {
  if (targetValue === 0) {
    return currentValue > 0 ? "AHEAD" : "ON_TRACK";
  }

  if (type === "EXPENSES") {
    if (currentValue > targetValue) return "BEHIND";
    if (currentValue <= targetValue * 0.8) return "AHEAD";
    return "ON_TRACK";
  }

  if (currentValue >= targetValue) {
    return currentValue >= targetValue * 1.1 ? "AHEAD" : "ACHIEVED";
  }

  if (progress >= 0.9) return "ON_TRACK";
  return "BEHIND";
}

async function computeRevenueValue(teamId: string, range: { start: Date; end: Date }) {
  const totals = await prisma.deliveryRevenue.aggregate({
    where: {
      teamId,
      isValidated: true,
      importedAt: { gte: range.start, lte: range.end },
    },
    _sum: { amount: true },
  });
  return totals._sum.amount ?? 0;
}

async function computeOrderMetrics(teamId: string, range: { start: Date; end: Date }) {
  const totalOrders = await prisma.order.count({
    where: { teamId, date: { gte: range.start, lte: range.end } },
  });

  const delivered = await prisma.order.count({
    where: {
      teamId,
      date: { gte: range.start, lte: range.end },
      OR: [
        { status: { contains: "livr", mode: "insensitive" } },
        { status: { contains: "delivered", mode: "insensitive" } },
      ],
    },
  });

  const returned = await prisma.order.count({
    where: {
      teamId,
      date: { gte: range.start, lte: range.end },
      OR: [
        { status: { contains: "retour", mode: "insensitive" } },
        { status: { contains: "returned", mode: "insensitive" } },
      ],
    },
  });

  const cancelled = await prisma.order.count({
    where: {
      teamId,
      date: { gte: range.start, lte: range.end },
      OR: [
        { status: { contains: "annul", mode: "insensitive" } },
        { status: { contains: "cancelled", mode: "insensitive" } },
      ],
    },
  });

  const pending = await prisma.order.count({
    where: {
      teamId,
      date: { gte: range.start, lte: range.end },
      OR: [
        { status: { contains: "attente", mode: "insensitive" } },
        { status: { contains: "pending", mode: "insensitive" } },
        { status: { contains: "cours", mode: "insensitive" } },
      ],
    },
  });

  const profitSum = await prisma.order.aggregate({
    where: { teamId, date: { gte: range.start, lte: range.end } },
    _sum: { profit: true },
  });

  return {
    totalOrders,
    delivered,
    returned,
    cancelled,
    pending,
    profit: profitSum._sum.profit ?? 0,
  };
}

async function computeProfitValue(teamId: string, range: { start: Date; end: Date }) {
  const orderProfit = await prisma.order.aggregate({
    where: { teamId, date: { gte: range.start, lte: range.end } },
    _sum: { profit: true },
  });

  const expenseSum = await prisma.expense.aggregate({
    where: { teamId, createdAt: { gte: range.start, lte: range.end } },
    _sum: { amount: true },
  });

  return (orderProfit._sum.profit ?? 0) - (expenseSum._sum.amount ?? 0);
}

async function computeExpenseValue(teamId: string, range: { start: Date; end: Date }) {
  const expenseSum = await prisma.expense.aggregate({
    where: { teamId, createdAt: { gte: range.start, lte: range.end } },
    _sum: { amount: true },
  });
  return expenseSum._sum.amount ?? 0;
}

async function computeDeliveryValue(teamId: string, range: { start: Date; end: Date }) {
  const metrics = await computeOrderMetrics(teamId, range);
  const total = metrics.totalOrders || 1;
  const deliveryRate = total === 0 ? 0 : (metrics.delivered / total) * 100;
  return { currentValue: deliveryRate, detail: metrics };
}

async function computeStockValue(teamId: string, range: { start: Date; end: Date }) {
  const sold = await prisma.order.aggregate({
    where: { teamId, date: { gte: range.start, lte: range.end } },
    _sum: { quantity: true },
  });

  const stockSum = await prisma.product.aggregate({
    where: { teamId },
    _sum: { stockQuantity: true },
  });

  const lowStock = await prisma.product.count({
    where: { teamId, stockQuantity: { lt: 5 } },
  });

  return {
    currentValue: sold._sum.quantity ?? 0,
    detail: {
      unitsSold: sold._sum.quantity ?? 0,
      stockAvailable: stockSum._sum.stockQuantity ?? 0,
      lowStockCount: lowStock,
    },
  };
}

async function computeGoalValue(teamId: string, goal: PrismaGoal) {
  const range = getRangeForGoal(goal);

  switch (goal.type) {
    case "REVENUE": {
      const currentValue = await computeRevenueValue(teamId, range);
      return { currentValue, detail: { periodStart: range.start.toISOString(), periodEnd: range.end.toISOString() } };
    }
    case "ORDERS": {
      const metrics = await computeOrderMetrics(teamId, range);
      return { currentValue: metrics.totalOrders, detail: metrics };
    }
    case "PROFIT": {
      const currentValue = await computeProfitValue(teamId, range);
      return { currentValue, detail: { periodStart: range.start.toISOString(), periodEnd: range.end.toISOString() } };
    }
    case "EXPENSES": {
      const currentValue = await computeExpenseValue(teamId, range);
      return { currentValue, detail: { periodStart: range.start.toISOString(), periodEnd: range.end.toISOString() } };
    }
    case "DELIVERY": {
      return await computeDeliveryValue(teamId, range);
    }
    case "STOCK": {
      return await computeStockValue(teamId, range);
    }
    case "CUSTOM":
    default:
      return {
        currentValue: goal.currentValue ?? 0,
        detail: { note: goal.description ?? "Objectif personnalisé" },
      };
  }
}

export async function enrichGoalMetrics(goal: PrismaGoal): Promise<GoalWithMetrics> {
  const { currentValue, detail } = await computeGoalValue(goal.teamId, goal);
  const progress = computeGoalProgress(goal.type as GoalType, currentValue, goal.targetValue);
  const status = computeGoalStatus(goal.type as GoalType, currentValue, goal.targetValue, progress);

  if (goal.currentValue !== currentValue || goal.status !== status) {
    await prisma.goal.update({
      where: { id: goal.id },
      data: {
        currentValue,
        status,
      },
    });
  }

  return {
    ...goal,
    currentValue,
    progress,
    status,
    detail,
  };
}

export async function getGoalsWithMetrics(teamId: string): Promise<GoalWithMetrics[]> {
  const goals = await prisma.goal.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(goals.map((goal) => enrichGoalMetrics(goal)));
}
``