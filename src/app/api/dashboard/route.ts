import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

const MONTH_NAMES = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function calculateMonthlyExpense(expenses: Array<{ amount: number; type: string; frequency: string | null }>): number {
  let monthlyTotal = 0;
  for (const exp of expenses) {
    switch (exp.frequency) {
      case "DAILY": monthlyTotal += exp.amount * 30; break;
      case "WEEKLY": monthlyTotal += exp.amount * 4; break;
      case "MONTHLY": monthlyTotal += exp.amount; break;
      case "YEARLY": monthlyTotal += exp.amount / 12; break;
    }
  }
  return monthlyTotal;
}

export async function GET() {
  try {
    const teamId = await getOrCreateDefaultTeamId();

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const sevenMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    const [
      thisMonth,
      lastMonth,
      productCount,
      chartOrders,
      allExpenses,
      expenseBreakdown,
      orderStats,
      productStats,
      paymentStats,
      topProducts,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: {
          teamId,
          OR: [
            { operationDate: { gte: thisMonthStart } },
            { operationDate: null, deliveredAt: { gte: thisMonthStart } },
            { operationDate: null, deliveredAt: null, returnedAt: { gte: thisMonthStart } },
            { operationDate: null, deliveredAt: null, returnedAt: null, date: { gte: thisMonthStart } }
          ]
        },
        _sum: { revenue: true, profit: true, cost: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: {
          teamId,
          OR: [
            { operationDate: { gte: lastMonthStart, lte: lastMonthEnd } },
            { operationDate: null, deliveredAt: { gte: lastMonthStart, lte: lastMonthEnd } },
            { operationDate: null, deliveredAt: null, returnedAt: { gte: lastMonthStart, lte: lastMonthEnd } },
            { operationDate: null, deliveredAt: null, returnedAt: null, date: { gte: lastMonthStart, lte: lastMonthEnd } }
          ]
        },
        _sum: { revenue: true, profit: true, cost: true },
        _count: { id: true },
      }),
      prisma.product.count({ where: { teamId } }),
      prisma.order.findMany({
        where: {
          teamId,
          OR: [
            { operationDate: { gte: sevenMonthsAgo } },
            { operationDate: null, deliveredAt: { gte: sevenMonthsAgo } },
            { operationDate: null, deliveredAt: null, returnedAt: { gte: sevenMonthsAgo } },
            { operationDate: null, deliveredAt: null, returnedAt: null, date: { gte: sevenMonthsAgo } }
          ]
        },
        select: { operationDate: true, deliveredAt: true, returnedAt: true, date: true, revenue: true, profit: true, cost: true },
        orderBy: { date: "asc" },
      }),
      prisma.expense.findMany({
        where: { teamId, isActive: true },
        select: { amount: true, type: true, frequency: true, isActive: true },
      }),
      prisma.expense.groupBy({
        by: ["category"],
        where: { teamId, isActive: true },
        _sum: { amount: true },
      }),
      prisma.order.groupBy({
        by: ["status"],
        where: { teamId },
        _count: { id: true },
      }),
      prisma.product.findMany({
        where: { teamId, stockQuantity: { lte: 5 } },
        select: { id: true },
      }),
      prisma.instaDeliveryPayment.findMany({
        where: { teamId },
      }),
      prisma.product.findMany({
        where: { teamId },
        orderBy: { salesCount: "desc" },
        take: 5,
        select: { id: true, name: true, salesCount: true, revenue: true, stockQuantity: true, stockEnAttente: true },
      }),
    ]);
    const { calculateFinanceMetrics } = await import("@/lib/finance");
    const thisMonthFinance = await calculateFinanceMetrics(teamId, thisMonthStart);
    const lastMonthFinance = await calculateFinanceMetrics(teamId, lastMonthStart, lastMonthEnd);

    const thisRevenue = thisMonthFinance.chiffreAffaires;
    const lastRevenue = lastMonthFinance.chiffreAffaires;
    const thisProfit = thisMonthFinance.netProfit;
    const lastProfit = lastMonthFinance.netProfit;
    const thisCost = thisMonthFinance.totalExpenses;
    const lastCost = lastMonthFinance.totalExpenses;
    
    const deliveredOrders = thisMonthFinance.deliveredOrdersCount;
    const returnedOrders = thisMonthFinance.returnedOrdersCount;
    const totalCommandesMonth = thisMonthFinance.totalOrdersCount;

    const monthlyExpenses = thisMonthFinance.otherExpenses;
    const totalExpenses = thisMonthFinance.totalExpenses;

    let pendingOrders = 0;
    let shippedOrders = 0;
    let totalCommandesVal = 0;

    const { isDeliveredStatus, isReturnStatus } = await import("@/lib/finance");

    for (const stat of orderStats) {
      const count = Number(stat._count.id) || 0;
      totalCommandesVal += count;
      const statusUpper = (stat.status || "").toUpperCase();
      if (!isDeliveredStatus(statusUpper) && !isReturnStatus(statusUpper)) {
        if (statusUpper.includes("PENDING") || statusUpper.includes("ATTENTE")) {
          pendingOrders += count;
        } else if (statusUpper.includes("SHIPPED") || statusUpper.includes("EXPEDIE")) {
          shippedOrders += count;
        }
      }
    }
    const coutRetour = thisMonthFinance.totalReturnFees;
    const lowStockProducts = productStats.length;
    const pendingPayments = paymentStats.filter((p) => p.status === "PAYMENT_RECEIVED").length;
    const validatedPayments = paymentStats.filter((p) => p.status === "PAYMENT_RECEIVED_VALIDATED_MANUAL").length;

    const monthlyMap: Record<string, { revenue: number; profit: number; label: string }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthlyMap[key] = { revenue: 0, profit: 0, label: MONTH_NAMES[d.getMonth()] };
    }

    for (const order of chartOrders) {
      const dateVal = order.operationDate || order.deliveredAt || order.returnedAt || order.date;
      if (!dateVal) continue;
      
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) continue;
      
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (monthlyMap[key]) {
        monthlyMap[key].revenue += order.revenue;
        monthlyMap[key].profit += order.profit;
      }
    }

    const chartData = Object.values(monthlyMap).map(({ label, revenue, profit }) => ({
      name: label,
      revenue: Math.round(revenue),
      profit: Math.round(profit),
    }));

    const thisOrdersVal = deliveredOrders;
    const lastOrdersVal = lastMonthFinance.deliveredOrdersCount;

    return NextResponse.json({
      totalCommandes: totalCommandesVal,
      commandesLivrees: deliveredOrders,
      commandesRetour: returnedOrders,
      coutRetour: coutRetour,
      commandesRecentes: thisOrdersVal,
      kpis: {
        revenue: {
          value: thisRevenue,
          change: pctChange(thisRevenue, lastRevenue),
        },
        validatedRevenue: {
          value: thisRevenue,
          change: pctChange(thisRevenue, lastRevenue),
        },
        profit: {
          value: thisProfit,
          change: pctChange(thisProfit, lastProfit),
        },
        orders: {
          value: thisOrdersVal,
          change: pctChange(thisOrdersVal, lastOrdersVal),
        },
        totalOrders: {
          value: totalCommandesVal,
          delivered: deliveredOrders,
          returned: returnedOrders,
          pending: pendingOrders,
          shipped: shippedOrders,
        },
        products: {
          value: productCount,
          lowStock: lowStockProducts,
          change: 0,
        },
        expenses: {
          value: totalExpenses,
          monthly: monthlyExpenses,
        },
        payments: {
          pending: pendingPayments,
          validated: validatedPayments,
        },
        netProfit: {
          value: thisProfit,
        },
      },
      chartData,
      orderStatuses: orderStats.map((item) => ({ status: item.status, count: item._count.id })),
      returnRate: (deliveredOrders + returnedOrders) > 0 ? Number(((returnedOrders / (deliveredOrders + returnedOrders)) * 100).toFixed(1)) : 0,
      expenseBreakdown: expenseBreakdown.map((item) => ({ category: item.category, total: item._sum.amount || 0 })),
      topProducts: topProducts.map((product) => ({
        id: product.id,
        name: product.name,
        salesCount: product.salesCount,
        revenue: product.revenue,
        stockQuantity: product.stockQuantity,
        pendingStock: product.stockEnAttente,
      })),
    });
  } catch (err) {
    console.error("[Dashboard] Error:", err);
    return NextResponse.json(
      { error: "Impossible de charger le tableau de bord." },
      { status: 500 }
    );
  }
}
