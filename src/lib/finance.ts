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

export type RawOrder = {
  id?: string;
  status?: string | null;
  revenue?: number | null;
  cost?: number | null;
  profit?: number | null;
  netProfit?: number | null;
  deliveryCostApplied?: number | null;
  returnCostApplied?: number | null;
  withholdingTaxApplied?: number | null;
  deliveryFee?: number | null;
  returnFee?: number | null;
  shippingProvider?: string | null;
  financeStatus?: string | null;
  paymentStatus?: string | null;
  operationDate?: Date | string | null;
  deliveredAt?: Date | string | null;
  returnedAt?: Date | string | null;
  date?: Date | string | null;
  deliveryRevenues?: Array<{
    id?: string;
    amount?: number | null;
    deliveryFee?: number | null;
    returnFee?: number | null;
    withholdingTaxApplied?: number | null;
    netAmount?: number | null;
    paymentStatus?: string | null;
    isValidated?: boolean | null;
  }>;
};

export type RawExpense = {
  id?: string;
  name?: string | null;
  amount: number;
  category?: string | null;
  type?: string | null;
  source?: string | null;
  frequency?: string | null;
  isActive?: boolean | null;
  startDate?: Date | string | null;
  createdAt?: Date | string | null;
};

export type RawTransaction = {
  id?: string;
  amount: number;
  type: string; // "INCOME" | "EXPENSE"
  category?: string | null;
  isRecurring?: boolean | null;
  date?: Date | string | null;
};

export type RawProductStockData = {
  id: string;
  name?: string | null;
  sku?: string | null;
  stockQuantity: number;
  stockEnAttente?: number | null;
  lowStockThreshold?: number | null;
  purchasePrice?: number | null;
  margin?: number | null;
  revenue?: number | null;
  stockMovements?: Array<{
    unitCost?: number | null;
  }>;
  orders?: Array<{
    cost?: number | null;
    quantity?: number | null;
  }>;
};

export type ProviderFinanceMetrics = {
  provider: string;
  chiffreAffaires: number;
  deliveryFees: number;
  returnFees: number;
  withholdingTax: number;
  productCosts: number;
  netProfit: number;
  netDue: number;
  paidAmount: number;
  remainingAmount: number;
  averageOrderValue: number;
  marginRate: number;
  orderCount: number;
  deliveredCount: number;
  returnedCount: number;
};

export type FinancialMetrics = {
  // 1. Chiffre d'affaires (Commandes livrées uniquement, COD inclus, sans doublon)
  chiffreAffaires: number;
  totalRevenue: number; // alias compatibilité

  // 2. Frais logistiques & Retenue à la source (déductions séparées des dépenses générales)
  totalDeliveryFees: number; // Frais de livraison des envois réussis
  totalReturnFees: number;   // Frais de retour des colis retournés
  totalWithholdingTax: number; // Retenue à la source déduite par les transporteurs
  totalLogisticsAndTax: number; // Somme des frais logistiques et de la RS

  // 3. Paiements reçus des sociétés de livraison
  paidAmount: number;         // Montants réels confirmés/encaissés en banque
  remainingAmount: number;    // Créances nettes transporteurs en attente (netDue - paidAmount)
  pendingAmount: number;      // alias compatibilité
  totalValidatedCA: number;   // CA brut des commandes avec paiement validé
  netDueFromCarriers: number; // Solde net théorique dû par les transporteurs (CA - Frais & RS)
  collectionRate: number;     // Taux d'encaissement (%)

  // 4. Dépenses générales (HORS logistique, RS et Meta Ads)
  generalExpenses: number;    // Emballages, services, outils, fournitures, etc.
  otherExpenses: number;      // alias compatibilité
  operationalCharges: number; // Sous-total charges opérationnelles

  // 5. Dépenses Meta Ads (séparées des dépenses générales)
  metaAdsExpenses: number;    // Dépenses publicitaires Meta Ads (en TND)
  adExpenses: number;         // alias compatibilité

  // 6. Bénéfice Net (CA - COGS - Frais livraison - Frais retour - RS - Meta Ads - Dépenses générales)
  netProfit: number;          // Résultat net comptable final
  grossMargin: number;        // Marge brute directe
  operatingProfit: number;    // Résultat d'exploitation (EBIT)
  totalProductCosts: number;  // COGS : coût d'achat des produits vendus et livrés
  totalExpenses: number;      // Somme totale de tous les coûts et charges déduits
  stockPurchasesCashFlow: number; // Décaissements achats de stock (distingués du P&L comptable)

  // 7. Valeur du Stock (Actif circulant valorisé : SUM(Prix d'achat × Quantité disponible))
  stockValue: number;         // Valeur totale du stock disponible en TND
  totalStockQuantity: number; // Quantité totale d'articles en stock
  totalProductsCount: number; // Nombre total de produits au catalogue
  lowStockCount: number;      // Nombre de produits sous le seuil d'alerte

  // Décompte de volumétrie
  deliveredOrdersCount: number;
  returnedOrdersCount: number;
  shippedOrdersCount: number;
  pendingOrdersCount: number;
  cancelledOrdersCount: number;
  totalOrdersCount: number;

  // Répartition par transporteur
  byProvider: ProviderFinanceMetrics[];
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
 * Calcule la valorisation du stock disponible basée sur les prix d'achat réels
 * Formule : Stock Value = SUM(Product Purchase Price × Available Quantity)
 */
export function calculateStockValuation(products: RawProductStockData[]): {
  stockValue: number;
  totalStockQuantity: number;
  totalProductsCount: number;
  lowStockCount: number;
} {
  let stockValue = 0;
  let totalStockQuantity = 0;
  let lowStockCount = 0;

  for (const product of products) {
    const availableQty = Math.max(0, toNumber(product.stockQuantity));
    totalStockQuantity += availableQty;

    const threshold = product.lowStockThreshold != null ? Number(product.lowStockThreshold) : 5;
    if (availableQty <= threshold) {
      lowStockCount++;
    }

    // Détermination stricte du prix d'achat unitaire (coût de revient, jamais le prix de vente)
    let purchasePrice = 0;
    if (product.purchasePrice != null && Number(product.purchasePrice) > 0) {
      purchasePrice = Number(product.purchasePrice);
    } else if (product.stockMovements && product.stockMovements.length > 0) {
      const validMovement = product.stockMovements.find((m) => toNumber(m.unitCost) > 0);
      if (validMovement && validMovement.unitCost) {
        purchasePrice = toNumber(validMovement.unitCost);
      }
    }

    if (purchasePrice === 0 && product.orders && product.orders.length > 0) {
      const validOrder = product.orders.find((o) => toNumber(o.cost) > 0 && toNumber(o.quantity) > 0);
      if (validOrder && validOrder.cost && validOrder.quantity) {
        purchasePrice = toNumber(validOrder.cost) / toNumber(validOrder.quantity);
      }
    }

    stockValue += round2(availableQty * purchasePrice);
  }

  return {
    stockValue: round2(stockValue),
    totalStockQuantity,
    totalProductsCount: products.length,
    lowStockCount,
  };
}

/**
 * MOTEUR FINANCIER CENTRALISÉ (Fonction Pure)
 * Calcule les indicateurs financiers selon la hiérarchie requise sans duplication.
 */
export function calculateFinanceFromData(input: {
  orders: RawOrder[];
  expenses: RawExpense[];
  transactions: RawTransaction[];
  settingsList: Array<{
    provider: string;
    deliveryCost: number;
    returnCost: number;
    withholdingTaxPercent: number;
  }>;
  products?: RawProductStockData[];
  stockValuation?: {
    stockValue: number;
    totalStockQuantity: number;
    totalProductsCount: number;
    lowStockCount: number;
  };
}): FinancialMetrics {
  const { orders, expenses, transactions, settingsList, products, stockValuation } = input;

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

  const getDeliveryFee = (order: RawOrder): number => {
    if (toNumber(order.deliveryCostApplied) > 0) return toNumber(order.deliveryCostApplied);
    if (toNumber(order.deliveryFee) > 0) return toNumber(order.deliveryFee);
    return getProviderSetting(order.shippingProvider).deliveryCost;
  };

  const getReturnFee = (order: RawOrder): number => {
    if (toNumber(order.returnCostApplied) > 0) return toNumber(order.returnCostApplied);
    if (toNumber(order.returnFee) > 0) return toNumber(order.returnFee);
    return getProviderSetting(order.shippingProvider).returnCost;
  };

  const getWithholdingTax = (order: RawOrder): number => {
    if (toNumber(order.withholdingTaxApplied) > 0) return toNumber(order.withholdingTaxApplied);
    const setting = getProviderSetting(order.shippingProvider);
    return calculateWithholdingTax(toNumber(order.revenue), setting.withholdingTaxPercent);
  };

  // ── 1. Classification des Commandes par Statut ─────────────────────────────
  const deliveredOrders: RawOrder[] = [];
  const returnedOrders: RawOrder[] = [];
  const shippedOrders: RawOrder[] = [];
  const pendingOrders: RawOrder[] = [];
  const cancelledOrders: RawOrder[] = [];

  for (const o of orders) {
    const s = normalizeStatus(o.status);
    if (isDeliveredStatus(s)) {
      deliveredOrders.push(o);
    } else if (isReturnStatus(s)) {
      returnedOrders.push(o);
    } else if (s.includes("SHIPPED") || s.includes("EXPEDIE") || s.includes("TRANSIT") || s.includes("COURS")) {
      shippedOrders.push(o);
    } else if (s.includes("CANCEL") || s.includes("ANNUL")) {
      cancelledOrders.push(o);
    } else {
      pendingOrders.push(o);
    }
  }

  // 1. Chiffre d'affaires (CA) : strictement les commandes livrées (COD inclus, pas de double comptage)
  const chiffreAffaires = round2(
    deliveredOrders.reduce((sum, order) => sum + toNumber(order.revenue), 0)
  );

  // 2. Frais logistiques & Retenue à la source (calculés par commande, jamais réinclus dans Dépenses)
  const totalDeliveryFees = round2(
    deliveredOrders.reduce((sum, order) => sum + getDeliveryFee(order), 0)
  );

  const totalReturnFees = round2(
    returnedOrders.reduce((sum, order) => sum + getReturnFee(order), 0)
  );

  const totalWithholdingTax = round2(
    deliveredOrders.reduce((sum, order) => sum + getWithholdingTax(order), 0)
  );

  const totalLogisticsAndTax = round2(totalDeliveryFees + totalReturnFees + totalWithholdingTax);

  // Coûts d'achat des produits livrés (COGS : Cost of Goods Sold)
  const totalProductCosts = round2(
    deliveredOrders.reduce((sum, order) => sum + toNumber(order.cost), 0)
  );

  // ── 2. Classification et Déduplication des Dépenses (Expense & Transaction) ──
  let metaAdsExpenses = 0;
  let operationalCharges = 0;
  let generalExpenses = 0;
  let stockPurchasesCashFlow = 0;

  for (const exp of expenses) {
    if (exp.isActive === false) continue;
    const amount = toNumber(exp.amount);
    if (amount <= 0) continue;

    const catUpper = String(exp.category ?? "").trim().toUpperCase();
    const nameUpper = String(exp.name ?? "").trim().toUpperCase();
    const sourceUpper = String(exp.source ?? "").trim().toUpperCase();

    // Règle critique : Ne pas déduire deux fois les frais transporteurs déjà calculés par commande
    const isCarrierFeeDuplicate =
      catUpper.includes("LOGISTIC") ||
      catUpper.includes("LIVRAISON") ||
      catUpper.includes("DELIVERY") ||
      catUpper.includes("RETOUR") ||
      catUpper.includes("COLISSIMO") ||
      catUpper.includes("INSTADELIVERY") ||
      catUpper.includes("COSMOS") ||
      catUpper.includes("INTIGO") ||
      catUpper.includes("RETENUE") ||
      catUpper.includes("SOURCE") ||
      catUpper.includes("WHT") ||
      nameUpper.includes("FRAIS DE LIVRAISON") ||
      nameUpper.includes("FRAIS DE RETOUR") ||
      nameUpper.includes("RETENUE A LA SOURCE") ||
      nameUpper.includes("RETENUE À LA SOURCE");

    if (isCarrierFeeDuplicate) {
      // Ignoré pour éviter le double comptage
      continue;
    }

    // 5. Dépenses Meta Ads (séparées des dépenses générales)
    const isMetaAds =
      sourceUpper === "META_ADS" ||
      catUpper === "META_ADS" ||
      nameUpper.includes("META ADS") ||
      nameUpper.includes("FACEBOOK") ||
      (catUpper.includes("PUB") && (nameUpper.includes("META") || sourceUpper === "META_ADS"));

    if (isMetaAds) {
      metaAdsExpenses += amount;
      continue;
    }

    // Règle comptable du Stock : les achats de stock sont des sorties de trésorerie,
    // mais le stock invendu reste un actif. Le coût des produits vendus est déjà
    // comptabilisé dans les COGS (totalProductCosts). On ne déduit pas les achats
    // de stock une deuxième fois dans le bénéfice net comptable.
    const isStockPurchase =
      catUpper.includes("STOCK") ||
      catUpper.includes("INVENTORY") ||
      catUpper.includes("FOURNISSEUR") ||
      catUpper.includes("SUPPLIER") ||
      nameUpper.includes("ACHAT DE STOCK") ||
      nameUpper.includes("ACHAT STOCK") ||
      nameUpper.includes("FACTURE FOURNISSEUR");

    if (isStockPurchase) {
      stockPurchasesCashFlow += amount;
      continue;
    }

    // Charges opérationnelles (outils, salaires, emballages, loyer, abonnements)
    const isOperational =
      catUpper.includes("TOOL") ||
      catUpper.includes("OUTIL") ||
      catUpper.includes("OPERAT") ||
      catUpper.includes("SALAR") ||
      catUpper.includes("PAIE") ||
      catUpper.includes("OFFICE") ||
      catUpper.includes("BUREAU") ||
      catUpper.includes("SUBSCRIPTION") ||
      catUpper.includes("ABONNEMENT") ||
      catUpper.includes("PACKAG") ||
      catUpper.includes("EMBALLAGE") ||
      catUpper.includes("LOYER") ||
      catUpper.includes("CHARGE");

    if (isOperational) {
      operationalCharges += amount;
    }

    // 4. Dépenses Générales (OPEX, packaging, services, fournitures...)
    generalExpenses += amount;
  }

  // Traitement sécurisé des transactions historiques pour éviter les doublons
  for (const tx of transactions) {
    if (String(tx.type ?? "").toUpperCase() !== "EXPENSE") continue;
    const amount = toNumber(tx.amount);
    if (amount <= 0) continue;

    const catUpper = String(tx.category ?? "").trim().toUpperCase();

    // Si catégorie logistique ou retenue -> déjà couverte par les commandes
    if (
      catUpper.includes("LOGISTIC") ||
      catUpper.includes("LIVRAISON") ||
      catUpper.includes("DELIVERY") ||
      catUpper.includes("RETOUR") ||
      catUpper.includes("RETENUE")
    ) {
      continue;
    }

    // Si Ads -> ne pas dupliquer si déjà présent dans Expense
    if (catUpper.includes("AD") || catUpper.includes("MARKETING")) {
      if (metaAdsExpenses === 0) {
        metaAdsExpenses += amount;
      }
      continue;
    }

    // Si Stock -> capitalisé dans le stock, tracé en trésorerie
    if (catUpper.includes("STOCK") || catUpper.includes("INVENTORY")) {
      stockPurchasesCashFlow += amount;
      continue;
    }

    // Si Outils / Opérationnel
    if (catUpper.includes("TOOL") || catUpper.includes("OPERAT")) {
      operationalCharges += amount;
    }

    generalExpenses += amount;
  }

  metaAdsExpenses = round2(metaAdsExpenses);
  operationalCharges = round2(operationalCharges);
  generalExpenses = round2(generalExpenses);
  stockPurchasesCashFlow = round2(stockPurchasesCashFlow);

  // ── 3. Trésorerie et Recouvrement Transporteurs ─────────────────────────────
  // Net théorique dû par les transporteurs après retenues logistiques et RS
  const netDueFromCarriers = round2(
    Math.max(0, chiffreAffaires - totalLogisticsAndTax)
  );

  const isPaymentValidated = (order: RawOrder) => {
    const latestRevenue = order.deliveryRevenues?.[0];
    return Boolean(
      normalizeStatus(order.status) === "PAID_DELIVERED" ||
      normalizeStatus(order.financeStatus) === "VALIDATED" ||
      normalizeStatus(order.paymentStatus) === "PAID" ||
      latestRevenue?.isValidated ||
      normalizeStatus(latestRevenue?.paymentStatus) === "VALIDATED"
    );
  };

  const validatedDeliveredOrders = deliveredOrders.filter(isPaymentValidated);

  // Total validé CA : chiffre d'affaires des commandes effectivement validées (0 si aucune validée)
  const totalValidatedCA = round2(
    validatedDeliveredOrders.reduce((sum, order) => sum + toNumber(order.revenue), 0)
  );

  // 3. Paiements reçus : solde net réel encaissé/validé auprès des transporteurs
  const paidAmount = round2(
    validatedDeliveredOrders.reduce((sum, order) => {
      const latestRevenue = order.deliveryRevenues?.[0];
      if (latestRevenue && toNumber(latestRevenue.netAmount) > 0) {
        return sum + toNumber(latestRevenue.netAmount);
      }
      if (latestRevenue && toNumber(latestRevenue.amount) > 0) {
        const fee = toNumber(latestRevenue.deliveryFee) || getDeliveryFee(order);
        const wht = toNumber(latestRevenue.withholdingTaxApplied) || getWithholdingTax(order);
        return sum + Math.max(0, toNumber(latestRevenue.amount) - fee - wht);
      }
      const orderRev = toNumber(order.revenue);
      const fee = getDeliveryFee(order);
      const wht = getWithholdingTax(order);
      return sum + Math.max(0, orderRev - fee - wht);
    }, 0)
  );

  // Reste à payer : créances nettes transporteurs en attente
  const remainingAmount = round2(Math.max(0, netDueFromCarriers - paidAmount));

  // Taux de recouvrement
  const collectionRate = round2(
    netDueFromCarriers > 0 ? (paidAmount / netDueFromCarriers) * 100 : 0
  );

  // ── 4. Rentabilité et P&L (Compte de Résultat) ──────────────────────────────
  // Marge brute directe sur les ventes (CA - COGS - Frais livraison - Frais retour)
  const grossMargin = round2(
    chiffreAffaires - totalProductCosts - totalDeliveryFees - totalReturnFees
  );

  // Résultat d'exploitation (EBIT avant retenue à la source)
  const operatingProfit = round2(
    grossMargin - (metaAdsExpenses + generalExpenses)
  );

  // 6. Bénéfice Net (Résultat final après Retenue à la source)
  const netProfit = round2(operatingProfit - totalWithholdingTax);

  // Somme totale de toutes les charges, déductions et coûts
  const totalExpenses = round2(
    totalProductCosts + totalDeliveryFees + totalReturnFees + totalWithholdingTax +
    metaAdsExpenses + generalExpenses
  );

  // ── 5. Répartition par Prestataire de Livraison ────────────────────────────
  const providerMap = new Map<string, {
    provider: string;
    chiffreAffaires: number;
    deliveryFees: number;
    returnFees: number;
    withholdingTax: number;
    productCosts: number;
    netProfit: number;
    netDue: number;
    paidAmount: number;
    remainingAmount: number;
    averageOrderValue: number;
    marginRate: number;
    orderCount: number;
    deliveredCount: number;
    returnedCount: number;
  }>();

  for (const o of orders) {
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
        netDue: 0,
        paidAmount: 0,
        remainingAmount: 0,
        averageOrderValue: 0,
        marginRate: 0,
        orderCount: 0,
        deliveredCount: 0,
        returnedCount: 0,
      });
    }
    const pData = providerMap.get(provider)!;
    pData.orderCount++;

    if (isDeliveredStatus(o.status)) {
      pData.deliveredCount++;
      const rev = toNumber(o.revenue);
      const delFee = getDeliveryFee(o);
      const wht = getWithholdingTax(o);
      const cost = toNumber(o.cost);

      pData.chiffreAffaires += rev;
      pData.deliveryFees += delFee;
      pData.withholdingTax += wht;
      pData.productCosts += cost;

      if (isPaymentValidated(o)) {
        const netOrder = Math.max(0, rev - delFee - wht);
        pData.paidAmount += netOrder;
      }
    } else if (isReturnStatus(o.status)) {
      pData.returnedCount++;
      pData.returnFees += getReturnFee(o);
    }
  }

  const byProvider = Array.from(providerMap.values()).map(p => {
    const pDeductions = p.deliveryFees + p.returnFees + p.withholdingTax;
    p.chiffreAffaires = round2(p.chiffreAffaires);
    p.deliveryFees = round2(p.deliveryFees);
    p.returnFees = round2(p.returnFees);
    p.withholdingTax = round2(p.withholdingTax);
    p.productCosts = round2(p.productCosts);
    p.netDue = round2(Math.max(0, p.chiffreAffaires - pDeductions));
    p.paidAmount = round2(p.paidAmount);
    p.remainingAmount = round2(Math.max(0, p.netDue - p.paidAmount));
    p.netProfit = round2(p.chiffreAffaires - (pDeductions + p.productCosts));
    p.averageOrderValue = round2(p.deliveredCount > 0 ? p.chiffreAffaires / p.deliveredCount : 0);
    p.marginRate = round2(p.chiffreAffaires > 0 ? (p.netProfit / p.chiffreAffaires) * 100 : 0);
    return p;
  }).sort((a, b) => b.chiffreAffaires - a.chiffreAffaires);

  // 7. Valeur du Stock
  const stockVal = stockValuation || (products ? calculateStockValuation(products) : {
    stockValue: 0,
    totalStockQuantity: 0,
    totalProductsCount: 0,
    lowStockCount: 0,
  });

  return {
    chiffreAffaires,
    totalRevenue: chiffreAffaires,
    totalDeliveryFees,
    totalReturnFees,
    totalWithholdingTax,
    totalLogisticsAndTax,
    paidAmount,
    remainingAmount,
    pendingAmount: remainingAmount,
    totalValidatedCA,
    netDueFromCarriers,
    collectionRate,
    generalExpenses,
    otherExpenses: generalExpenses,
    operationalCharges,
    metaAdsExpenses,
    adExpenses: metaAdsExpenses,
    netProfit,
    grossMargin,
    operatingProfit,
    totalProductCosts,
    totalExpenses,
    stockPurchasesCashFlow,
    stockValue: stockVal.stockValue,
    totalStockQuantity: stockVal.totalStockQuantity,
    totalProductsCount: stockVal.totalProductsCount,
    lowStockCount: stockVal.lowStockCount,
    deliveredOrdersCount: deliveredOrders.length,
    returnedOrdersCount: returnedOrders.length,
    shippedOrdersCount: shippedOrders.length,
    pendingOrdersCount: pendingOrders.length,
    cancelledOrdersCount: cancelledOrders.length,
    totalOrdersCount: orders.length,
    byProvider
  };
}

/**
 * Calcule les métriques globales pour une équipe et une période donnée via Prisma.
 */
export async function calculateFinanceMetrics(
  teamId: string,
  startDate?: Date,
  endDate?: Date
): Promise<FinancialMetrics> {
  const dateFilter = (startDate || endDate) ? {
    ...(startDate && { gte: startDate }),
    ...(endDate && { lte: endDate })
  } : undefined;

  const [allOrders, expenses, transactions, settingsList, products] = await Promise.all([
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
            id: true,
            amount: true,
            deliveryFee: true,
            returnFee: true,
            withholdingTaxApplied: true,
            netAmount: true,
            paymentStatus: true,
            isValidated: true,
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: {
        teamId,
        isActive: true,
        ...(dateFilter && { startDate: dateFilter })
      }
    }),
    prisma.transaction.findMany({
      where: {
        teamId,
        type: "EXPENSE",
        ...(dateFilter && { date: dateFilter })
      }
    }),
    prisma.deliveryCompanySetting.findMany(),
    prisma.product.findMany({
      where: { teamId },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        stockEnAttente: true,
        lowStockThreshold: true,
        margin: true,
        revenue: true,
        stockMovements: {
          where: { type: "IN", status: "COMPLETED", unitCost: { gt: 0 } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { unitCost: true },
        },
        orders: {
          where: { cost: { gt: 0 }, quantity: { gt: 0 } },
          orderBy: { date: "desc" },
          take: 1,
          select: { cost: true, quantity: true },
        },
      },
    }),
  ]);

  return calculateFinanceFromData({
    orders: allOrders as RawOrder[],
    expenses: expenses as RawExpense[],
    transactions: transactions as RawTransaction[],
    settingsList: settingsList.map(s => ({
      provider: s.provider,
      deliveryCost: toNumber(s.deliveryCost),
      returnCost: toNumber(s.returnCost),
      withholdingTaxPercent: toNumber(s.withholdingTaxPercent),
    })),
    products: products as RawProductStockData[],
  });
}
