import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { calculateFinanceMetrics, isDeliveredStatus, isReturnStatus } from "@/lib/finance";

const MONTH_NAMES = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
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
      productCount,
      chartOrders,
      allExpenses,
      expenseBreakdown,
      orderStats,
      productStats,
      paymentStats,
      topProducts,
    ] = await Promise.all([
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
        select: {
          status: true,
          operationDate: true,
          deliveredAt: true,
          returnedAt: true,
          date: true,
          revenue: true,
          profit: true,
          netProfit: true,
          cost: true,
          deliveryCostApplied: true,
          returnCostApplied: true,
          withholdingTaxApplied: true,
          deliveryFee: true,
          returnFee: true,
        },
        orderBy: { date: "asc" },
      }),
      prisma.expense.findMany({
        where: { teamId, isActive: true },
        select: {
          amount: true,
          type: true,
          frequency: true,
          isActive: true,
          category: true,
          source: true,
          startDate: true,
          createdAt: true,
        },
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

    // Calcul unifié via le moteur financier centralisé
    const thisMonthFinance = await calculateFinanceMetrics(teamId, thisMonthStart);
    const lastMonthFinance = await calculateFinanceMetrics(teamId, lastMonthStart, lastMonthEnd);

    const thisRevenue = thisMonthFinance.chiffreAffaires;
    const lastRevenue = lastMonthFinance.chiffreAffaires;
    const thisProfit = thisMonthFinance.netProfit;
    const lastProfit = lastMonthFinance.netProfit;
    
    const deliveredOrders = thisMonthFinance.deliveredOrdersCount;
    const returnedOrders = thisMonthFinance.returnedOrdersCount;

    const monthlyExpenses = thisMonthFinance.otherExpenses + thisMonthFinance.adExpenses + thisMonthFinance.operationalCharges;
    const totalExpenses = thisMonthFinance.totalExpenses;

    let pendingOrders = 0;
    let shippedOrders = 0;
    let totalCommandesVal = 0;

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

    // Construction du graphique d'évolution mensuelle (7 derniers mois)
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
      if (!monthlyMap[key]) continue;

      if (isDeliveredStatus(order.status)) {
        monthlyMap[key].revenue += (order.revenue || 0);
        const orderNet = (order.netProfit !== null && order.netProfit !== undefined && order.netProfit !== 0)
          ? order.netProfit
          : ((order.revenue || 0) - (order.deliveryCostApplied || order.deliveryFee || 8) - (order.withholdingTaxApplied || 0) - (order.cost || 0));
        monthlyMap[key].profit += orderNet;
      } else if (isReturnStatus(order.status)) {
        const retFee = (order.returnCostApplied || order.returnFee || 3);
        monthlyMap[key].profit -= retFee;
      }
    }

    // Déduction des dépenses mensuelles hors doublons transporteurs
    for (const exp of allExpenses) {
      const expDate = exp.startDate || exp.createdAt;
      if (!expDate) continue;
      const d = new Date(expDate);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (monthlyMap[key]) {
        const catUpper = (exp.category || "").toUpperCase();
        const isCarrierDuplicate =
          catUpper.includes("LOGISTIC") ||
          catUpper.includes("LIVRAISON") ||
          catUpper.includes("DELIVERY") ||
          catUpper.includes("RETOUR");
        if (!isCarrierDuplicate) {
          monthlyMap[key].profit -= (exp.amount || 0);
        }
      }
    }

    // Alignement parfait des mois actuels et précédents avec calculateFinanceMetrics
    const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
    if (monthlyMap[currentMonthKey]) {
      monthlyMap[currentMonthKey].revenue = thisRevenue;
      monthlyMap[currentMonthKey].profit = thisProfit;
    }
    const lastMonthKey = `${lastMonthStart.getFullYear()}-${lastMonthStart.getMonth()}`;
    if (monthlyMap[lastMonthKey]) {
      monthlyMap[lastMonthKey].revenue = lastRevenue;
      monthlyMap[lastMonthKey].profit = lastProfit;
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
          value: thisMonthFinance.totalValidatedCA,
          change: pctChange(thisMonthFinance.totalValidatedCA, lastMonthFinance.totalValidatedCA),
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
          oneTime: 0,
        },
        generalExpenses: {
          value: thisMonthFinance.generalExpenses,
          change: pctChange(thisMonthFinance.generalExpenses, lastMonthFinance.generalExpenses),
        },
        metaAds: {
          value: thisMonthFinance.metaAdsExpenses,
          change: pctChange(thisMonthFinance.metaAdsExpenses, lastMonthFinance.metaAdsExpenses),
        },
        logistics: {
          deliveryFees: thisMonthFinance.totalDeliveryFees,
          returnFees: thisMonthFinance.totalReturnFees,
          withholdingTax: thisMonthFinance.totalWithholdingTax,
          total: thisMonthFinance.totalLogisticsAndTax,
        },
        payments: {
          pending: pendingPayments,
          validated: validatedPayments,
          paidAmount: thisMonthFinance.paidAmount,
          remainingAmount: thisMonthFinance.remainingAmount,
          collectionRate: thisMonthFinance.collectionRate,
        },
        netProfit: {
          value: thisProfit,
          change: pctChange(thisProfit, lastProfit),
          marginRate: thisRevenue > 0 ? (thisProfit / thisRevenue) * 100 : 0,
        },
        cogs: {
          value: thisMonthFinance.totalProductCosts,
        },
        stockValue: {
          value: thisMonthFinance.stockValue,
          totalQuantity: thisMonthFinance.totalStockQuantity,
          lowStock: thisMonthFinance.lowStockCount,
          productsCount: thisMonthFinance.totalProductsCount,
        },
      },
      finance: thisMonthFinance,
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
