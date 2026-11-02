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
    "DELIVERED_BY_SENDER",
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
  if (providerRaw.includes("INTIGO")) return "INTIGO";
  if (providerRaw.includes("COSMOS")) return "COSMOS";
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

export function round2(num: number): number {
  return Math.round((toNumber(num) + Number.EPSILON) * 100) / 100;
}

/**
 * Calcule les métriques globales selon la formule métier :
 * Paiements reçus = CA − (Frais de livraison + Frais de retour + Retenue à la source)
 */
export async function calculateFinanceMetrics(teamId: string, startDate?: Date, endDate?: Date) {
  const dateFilter = (startDate || endDate) ? {
    ...(startDate && { gte: startDate }),
    ...(endDate && { lte: endDate })
  } : undefined;

  const [allOrders, expenses, transactions, settingsList] = await Promise.all([
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
    }),
    prisma.deliveryCompanySetting.findMany()
  ]);

  const settingsMap = new Map<string, DeliverySettings>();
  for (const s of settingsList) {
    settingsMap.set(normalizeFinanceProvider(s.provider), {
      deliveryCost: toNumber(s.deliveryCost),
      returnCost: toNumber(s.returnCost),
      withholdingTaxPercent: toNumber(s.withholdingTaxPercent),
    });
  }

  const getProviderSetting = (provider: string | null | undefined): DeliverySettings => {
    const key = normalizeFinanceProvider(provider);
    return (
      settingsMap.get(key) || {
        deliveryCost: 8,
        returnCost: 3,
        withholdingTaxPercent: 0,
      }
    );
  };

  const getDeliveryFee = (order: (typeof allOrders)[number]): number => {
    if (toNumber(order.deliveryCostApplied) > 0) return toNumber(order.deliveryCostApplied);
    if (toNumber(order.deliveryFee) > 0) return toNumber(order.deliveryFee);
    return getProviderSetting(order.shippingProvider).deliveryCost;
  };

  const getReturnFee = (order: (typeof allOrders)[number]): number => {
    if (toNumber(order.returnCostApplied) > 0) return toNumber(order.returnCostApplied);
    if (toNumber(order.returnFee) > 0) return toNumber(order.returnFee);
    return getProviderSetting(order.shippingProvider).returnCost;
  };

  const getWithholdingTax = (order: (typeof allOrders)[number]): number => {
    if (toNumber(order.withholdingTaxApplied) > 0) return toNumber(order.withholdingTaxApplied);
    const setting = getProviderSetting(order.shippingProvider);
    return calculateWithholdingTax(toNumber(order.revenue), setting.withholdingTaxPercent);
  };

  const deliveredOrders = allOrders.filter(o => isDeliveredStatus(o.status));
  const returnedOrders = allOrders.filter(o => isReturnStatus(o.status));

  // 1. Chiffre d'affaires (CA) des commandes livrées
  const chiffreAffaires = round2(
    deliveredOrders.reduce((sum, order) => sum + toNumber(order.revenue), 0)
  );

  // 2. Frais de livraison des commandes livrées
  const totalDeliveryFees = round2(
    deliveredOrders.reduce((sum, order) => sum + getDeliveryFee(order), 0)
  );

  // 3. Frais de retour des commandes retournées
  const totalReturnFees = round2(
    returnedOrders.reduce((sum, order) => sum + getReturnFee(order), 0)
  );

  // 4. Retenue à la source des commandes livrées
  const totalWithholdingTax = round2(
    deliveredOrders.reduce((sum, order) => sum + getWithholdingTax(order), 0)
  );

  const totalProductCosts = round2(
    deliveredOrders.reduce((sum, order) => sum + toNumber(order.cost), 0)
  );

  const otherExpenses = round2(
    expenses.reduce((sum, e) => sum + toNumber(e.amount), 0) +
    transactions.reduce((sum, t) => sum + toNumber(t.amount), 0)
  );

  const totalExpenses = round2(
    totalDeliveryFees + totalReturnFees + totalWithholdingTax + totalProductCosts + otherExpenses
  );

  const netProfit = round2(chiffreAffaires - totalExpenses);

  // RÈGLE MÉTIER EXPLICITE :
  // Paiements reçus = CA − (Frais de livraison + Frais de retour + Retenue à la source)
  const paidAmount = round2(
    chiffreAffaires > 0
      ? Math.max(0, chiffreAffaires - (totalDeliveryFees + totalReturnFees + totalWithholdingTax))
      : 0
  );

  const isPaymentValidated = (order: (typeof allOrders)[number]) => {
    const latestRevenue = order.deliveryRevenues[0];
    return Boolean(
      normalizeStatus(order.status) === "PAID_DELIVERED" ||
      normalizeStatus(order.financeStatus) === "VALIDATED" ||
      latestRevenue?.isValidated ||
      normalizeStatus(latestRevenue?.paymentStatus) === "VALIDATED"
    );
  };

  const validatedDeliveredOrders = deliveredOrders.filter(isPaymentValidated);
  const totalValidatedCA = round2(
    validatedDeliveredOrders.length > 0
      ? validatedDeliveredOrders.reduce((sum, order) => sum + toNumber(order.revenue), 0)
      : chiffreAffaires
  );

  const remainingAmount = round2(Math.max(0, chiffreAffaires - paidAmount));

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
      pData.deliveryFees += getDeliveryFee(o);
      pData.withholdingTax += getWithholdingTax(o);
      pData.productCosts += toNumber(o.cost);
    } else if (isReturnStatus(o.status)) {
      pData.returnedCount++;
      pData.returnFees += getReturnFee(o);
    }
  }

  // Calculer netProfit et paidAmount par provider selon la même formule :
  // Paiements reçus = CA − (Frais de livraison + Frais de retour + Retenue à la source)
  const byProvider = Array.from(providerMap.values()).map(p => {
    const providerDeductions = p.deliveryFees + p.returnFees + p.withholdingTax;
    p.chiffreAffaires = round2(p.chiffreAffaires);
    p.deliveryFees = round2(p.deliveryFees);
    p.returnFees = round2(p.returnFees);
    p.withholdingTax = round2(p.withholdingTax);
    p.productCosts = round2(p.productCosts);
    p.paidAmount = round2(p.chiffreAffaires > 0 ? Math.max(0, p.chiffreAffaires - providerDeductions) : 0);
    p.remainingAmount = round2(Math.max(0, p.chiffreAffaires - p.paidAmount));
    p.netProfit = round2(p.chiffreAffaires - (providerDeductions + p.productCosts));
    p.averageOrderValue = round2(p.deliveredCount > 0 ? p.chiffreAffaires / p.deliveredCount : 0);
    p.marginRate = round2(p.chiffreAffaires > 0 ? (p.netProfit / p.chiffreAffaires) * 100 : 0);
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
