import { prisma } from "@/lib/prisma";

export type DeliverySettings = {
  deliveryCost: number;
  returnCost: number;
  withholdingTaxPercent: number;
};

export type FinanceInput = {
  totalAmount: number;
  status: string | null | undefined;
  settings: DeliverySettings;
};

export type FinanceResult = {
  validatedRevenue: number;
  deliveryCostApplied: number;
  returnCostApplied: number;
  withholdingTaxApplied: number;
  netProfit: number;
};

export function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isDeliveredStatus(status: string | null | undefined): boolean {
  return [
    "LIVRE",
    "LIVREE",
    "DELIVERED",
    "DELIVERED_CLOSED",
    "PAID_DELIVERED",
    "EXCHANGE_DELIVERED",
    "DELIVERED_TO_CUSTOMER",
  ].includes(normalizeStatus(status));
}

export function isReturnStatus(status: string | null | undefined): boolean {
  return [
    "RETOUR",
    "RETOURNE",
    "RETOURNEE",
    "RETOUR_RECU",
    "RETOUR_RECUPERE",
    "RETOUR_LIVRE",
    "ANOMALIE",
    "ECHEC",
    "FAILED",
    "RETURN",
    "RETURNED",
    "RETURN_CLOSED",
  ].includes(normalizeStatus(status));
}

export function toNumber(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function normalizeFinanceProvider(provider: string | null | undefined): string {
  const providerRaw = String(provider ?? "").toUpperCase();
  if (providerRaw.includes("COLISSIMO")) return "COLISSIMO";
  if (providerRaw.includes("INSTA")) return "INSTADELIVERY";
  return providerRaw || "AUTRE";
}

export function calculateWithholdingTax(amount: number, percent: number): number {
  const safeAmount = Math.max(0, toNumber(amount));
  const safePercent = Math.max(0, toNumber(percent));
  return safeAmount * (safePercent / 100);
}

/**
 * Calcule les métriques financières d'une commande individuelle
 */
export function calculateOrderFinance(input: FinanceInput & { purchaseCost?: number }): FinanceResult {
  const revenue = toNumber(input.totalAmount);
  const deliveryCost = toNumber(input.settings.deliveryCost ?? 8);
  const returnCost = toNumber(input.settings.returnCost ?? 3);
  const withholdingTax = calculateWithholdingTax(
    revenue,
    input.settings.withholdingTaxPercent || 0
  );
  const purchaseCost = Number(input.purchaseCost || 0);

  if (isDeliveredStatus(input.status)) {
    return {
      validatedRevenue: revenue,
      deliveryCostApplied: deliveryCost,
      returnCostApplied: 0,
      withholdingTaxApplied: withholdingTax,
      netProfit: revenue - deliveryCost - withholdingTax - purchaseCost,
    };
  }

  if (isReturnStatus(input.status)) {
    return {
      validatedRevenue: 0,
      deliveryCostApplied: 0,
      returnCostApplied: returnCost,
      withholdingTaxApplied: 0,
      netProfit: -returnCost,
    };
  }

  return {
    validatedRevenue: 0,
    deliveryCostApplied: 0,
    returnCostApplied: 0,
    withholdingTaxApplied: 0,
    netProfit: 0,
  };
}

/**
 * Récupère les paramètres de coût pour une société de livraison
 */
export async function getFinanceSettings(teamId: string, provider: string | null | undefined) {
  const normalizedProvider = normalizeFinanceProvider(provider);
  const setting = await prisma.deliveryCompanySetting.findUnique({
    where: { provider: normalizedProvider }
  });
  
  if (setting) {
    return {
      deliveryCost: setting.deliveryCost,
      returnCost: setting.returnCost,
      withholdingTaxPercent: setting.withholdingTaxPercent,
    };
  }
  return { deliveryCost: 8, returnCost: 3, withholdingTaxPercent: 0 };
}

/**
 * Calcule les métriques globales selon la nouvelle logique métier
 */
export async function calculateFinanceMetrics(teamId: string, startDate?: Date, endDate?: Date) {
  const dateFilter = (startDate || endDate) ? {
    ...(startDate && { gte: startDate }),
    ...(endDate && { lte: endDate })
  } : undefined;

  const [allOrders, expenses, transactions] = await Promise.all([
    prisma.order.findMany({
      where: {
        teamId,
        ...(dateFilter && {
          OR: [
            { operationDate: dateFilter },
            { operationDate: null, deliveredAt: dateFilter },
            { operationDate: null, deliveredAt: null, returnedAt: dateFilter },
            { operationDate: null, deliveredAt: null, returnedAt: null, date: dateFilter }
          ]
        })
      },
      include: {
        deliveryRevenues: {
          orderBy: { importedAt: "desc" },
          take: 1,
          select: {
            amount: true,
            paymentStatus: true,
            isValidated: true,
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: { teamId, isActive: true, ...(dateFilter && { createdAt: dateFilter }) }
    }),
    prisma.transaction.findMany({
      where: { teamId, type: "EXPENSE", ...(dateFilter && { date: dateFilter }) }
    })
  ]);

  const deliveredOrders = allOrders.filter(o => isDeliveredStatus(o.status));
  const returnedOrders = allOrders.filter(o => isReturnStatus(o.status));

  // Logique fournie par l'utilisateur
  const chiffreAffaires = deliveredOrders.reduce(
    (sum, order) => sum + toNumber(order.revenue),
    0
  );

  const totalDeliveryFees = deliveredOrders.reduce(
    (sum, order) => sum + toNumber(order.deliveryCostApplied),
    0
  );

  const totalReturnFees = returnedOrders.reduce(
    (sum, order) => sum + toNumber(order.returnCostApplied),
    0
  );

  const totalWithholdingTax = deliveredOrders.reduce(
    (sum, order) => sum + toNumber(order.withholdingTaxApplied),
    0
  );

  const totalProductCosts = deliveredOrders.reduce(
    (sum, order) => sum + toNumber(order.cost),
    0
  );

  const otherExpenses = 
    expenses.reduce((sum, e) => sum + toNumber(e.amount), 0) +
    transactions.reduce((sum, t) => sum + toNumber(t.amount), 0);

  const totalExpenses =
    totalDeliveryFees + totalReturnFees + totalWithholdingTax + totalProductCosts + otherExpenses;

  const netProfit = chiffreAffaires - totalExpenses;

  const isPaymentValidated = (order: (typeof allOrders)[number]) => {
    const latestRevenue = order.deliveryRevenues[0];
    return Boolean(
      latestRevenue?.isValidated ||
        normalizeStatus(latestRevenue?.paymentStatus) === "VALIDATED" ||
        normalizeStatus(order.financeStatus) === "VALIDATED"
    );
  };

  const getValidatedAmount = (order: (typeof allOrders)[number]) => {
    if (!isPaymentValidated(order) || !isDeliveredStatus(order.status)) return 0;
    const latestRevenue = order.deliveryRevenues[0];
    return (
      toNumber(order.validatedRevenue) ||
      toNumber(latestRevenue?.amount) ||
      toNumber(order.revenue)
    );
  };

  const paidAmount = deliveredOrders.reduce(
    (sum, order) => sum + getValidatedAmount(order),
    0
  );
  const totalValidatedCA = paidAmount;
  const remainingAmount = Math.max(0, chiffreAffaires - paidAmount);

  // Stats par prestataire
  const providerMap = new Map<string, any>();
  for (const o of allOrders) {
    const provider = normalizeFinanceProvider(o.shippingProvider);

    if (!providerMap.has(provider)) {
      providerMap.set(provider, {
        provider,
        chiffreAffaires: 0,
        deliveryFees: 0,
        returnFees: 0,
        withholdingTax: 0,
        productCosts: 0,
        netProfit: 0,
        paidAmount: 0,
        remainingAmount: 0,
        averageOrderValue: 0,
        marginRate: 0,
        orderCount: 0,
        deliveredCount: 0,
        returnedCount: 0
      });
    }
    const pData = providerMap.get(provider);
    pData.orderCount++;

    if (isDeliveredStatus(o.status)) {
      pData.deliveredCount++;
      pData.chiffreAffaires += toNumber(o.revenue);
      pData.deliveryFees += toNumber(o.deliveryCostApplied);
      pData.withholdingTax += toNumber(o.withholdingTaxApplied);
      pData.productCosts += toNumber(o.cost);
      pData.paidAmount = toNumber(pData.paidAmount) + getValidatedAmount(o);
    } else if (isReturnStatus(o.status)) {
      pData.returnedCount++;
      pData.returnFees += toNumber(o.returnCostApplied);
    }
  }

  // Calculer netProfit par provider
  const byProvider = Array.from(providerMap.values()).map(p => {
    p.netProfit = p.chiffreAffaires - (p.deliveryFees + p.returnFees + p.withholdingTax + p.productCosts);
    p.remainingAmount = Math.max(0, p.chiffreAffaires - toNumber(p.paidAmount));
    p.averageOrderValue = p.deliveredCount > 0 ? p.chiffreAffaires / p.deliveredCount : 0;
    p.marginRate = p.chiffreAffaires > 0 ? (p.netProfit / p.chiffreAffaires) * 100 : 0;
    return p;
  }).sort((a, b) => b.chiffreAffaires - a.chiffreAffaires);

  return {
    chiffreAffaires,
    totalRevenue: chiffreAffaires,
    totalValidatedCA,
    netProfit,
    totalDeliveryFees,
    totalReturnFees,
    totalWithholdingTax,
    totalProductCosts,
    otherExpenses,
    totalExpenses,
    paidAmount,
    remainingAmount,
    deliveredOrdersCount: deliveredOrders.length,
    returnedOrdersCount: returnedOrders.length,
    totalOrdersCount: allOrders.length,
    byProvider
  };
}
