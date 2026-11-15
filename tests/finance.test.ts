import assert from "node:assert/strict";
import {
  calculateWithholdingTax,
  calculateOrderFinance,
  normalizeFinanceProvider,
  isDeliveredStatus,
  isReturnStatus,
  round2,
  calculateFinanceFromData,
  RawOrder,
  RawExpense,
  RawTransaction,
} from "../src/lib/finance";

console.log("▶ Running Comprehensive Financial Calculation Engine Test Suite...");

// ─── 1. Provider & Status Helpers ─────────────────────────────────────────────
assert.equal(normalizeFinanceProvider("Colissimo"), "COLISSIMO");
assert.equal(normalizeFinanceProvider("COLISSIMO_TN"), "COLISSIMO");
assert.equal(normalizeFinanceProvider("InstaDelivery"), "INSTADELIVERY");
assert.equal(normalizeFinanceProvider("INTIGO"), "INTIGO");
assert.equal(normalizeFinanceProvider("Cosmos"), "COSMOS");
assert.equal(normalizeFinanceProvider("AUTRE"), "AUTRE");

assert.equal(isDeliveredStatus("LIVRE"), true);
assert.equal(isDeliveredStatus("LIVREE"), true);
assert.equal(isDeliveredStatus("PAID_DELIVERED"), true);
assert.equal(isDeliveredStatus("DELIVERED"), true);
assert.equal(isDeliveredStatus("DELIVERED_TO_CUSTOMER"), true);
assert.equal(isDeliveredStatus("PENDING"), false);
assert.equal(isDeliveredStatus("SHIPPED"), false);
assert.equal(isDeliveredStatus("RETOUR"), false);

assert.equal(isReturnStatus("RETOUR"), true);
assert.equal(isReturnStatus("RETOURNE"), true);
assert.equal(isReturnStatus("RETURNED"), true);
assert.equal(isReturnStatus("RETOUR_RECU"), true);
assert.equal(isReturnStatus("FAILED"), true);
assert.equal(isReturnStatus("DELIVERED"), false);

// ─── 2. Withholding Tax Calculation ───────────────────────────────────────────
assert.equal(calculateWithholdingTax(100, 3), 3);
assert.equal(calculateWithholdingTax(150, 1.5), 2.25);
assert.equal(calculateWithholdingTax(100, 0), 0);
assert.equal(calculateWithholdingTax(0, 3), 0);

// ─── 3. Unit Order Finance (calculateOrderFinance) ────────────────────────────
// Delivered order
const deliveredFinance = calculateOrderFinance({
  totalAmount: 150,
  status: "LIVRE",
  settings: {
    deliveryCost: 8,
    returnCost: 3,
    withholdingTaxPercent: 1.5,
  },
  purchaseCost: 50,
});
assert.equal(deliveredFinance.validatedRevenue, 150);
assert.equal(deliveredFinance.deliveryCostApplied, 8);
assert.equal(deliveredFinance.returnCostApplied, 0);
assert.equal(deliveredFinance.withholdingTaxApplied, 2.25);
assert.equal(deliveredFinance.netProfit, 150 - 8 - 2.25 - 50);

// Returned order
const returnedFinance = calculateOrderFinance({
  totalAmount: 150,
  status: "RETOUR",
  settings: {
    deliveryCost: 8,
    returnCost: 4,
    withholdingTaxPercent: 1.5,
  },
});
assert.equal(returnedFinance.validatedRevenue, 0);
assert.equal(returnedFinance.deliveryCostApplied, 0);
assert.equal(returnedFinance.returnCostApplied, 4);
assert.equal(returnedFinance.withholdingTaxApplied, 0);
assert.equal(returnedFinance.netProfit, -4);

// Shipped order (in-transit: 0 revenue realized, 0 profit)
const shippedFinance = calculateOrderFinance({
  totalAmount: 150,
  status: "EXPEDIE",
  settings: {
    deliveryCost: 8,
    returnCost: 3,
    withholdingTaxPercent: 1.5,
  },
});
assert.equal(shippedFinance.validatedRevenue, 0);
assert.equal(shippedFinance.netProfit, 0);

// ─── 4. Default Settings Fixture ──────────────────────────────────────────────
const defaultSettingsList = [
  { provider: "COLISSIMO", deliveryCost: 8, returnCost: 3, withholdingTaxPercent: 1.5 },
  { provider: "INSTADELIVERY", deliveryCost: 7.5, returnCost: 3.5, withholdingTaxPercent: 1.0 },
  { provider: "COSMOS", deliveryCost: 8, returnCost: 3, withholdingTaxPercent: 0 },
  { provider: "INTIGO", deliveryCost: 7, returnCost: 2.5, withholdingTaxPercent: 0 },
];

// ─── 5. Regression Test: Delivered vs Shipped vs Returned vs Cancelled ────────
{
  const orders: RawOrder[] = [
    // 3 Delivered orders
    { id: "o1", status: "DELIVERED", revenue: 100, cost: 30, shippingProvider: "COLISSIMO" },
    { id: "o2", status: "LIVRE", revenue: 150, cost: 45, shippingProvider: "COLISSIMO" },
    { id: "o3", status: "PAID_DELIVERED", revenue: 200, cost: 60, shippingProvider: "INSTADELIVERY" },
    // 2 Shipped orders (in transit - should NOT count toward realized CA)
    { id: "o4", status: "SHIPPED", revenue: 120, cost: 35, shippingProvider: "COLISSIMO" },
    { id: "o5", status: "EXPEDIE", revenue: 80, cost: 25, shippingProvider: "INSTADELIVERY" },
    // 2 Returned orders
    { id: "o6", status: "RETURNED", revenue: 110, cost: 30, shippingProvider: "COLISSIMO" },
    { id: "o7", status: "RETOUR_RECU", revenue: 90, cost: 28, shippingProvider: "INSTADELIVERY" },
    // 2 Pending / Cancelled
    { id: "o8", status: "PENDING", revenue: 100, cost: 30, shippingProvider: "COLISSIMO" },
    { id: "o9", status: "CANCELLED", revenue: 130, cost: 40, shippingProvider: "COLISSIMO" },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // Chiffre d'affaires = 100 + 150 + 200 = 450 DT
  assert.equal(result.chiffreAffaires, 450);
  assert.equal(result.deliveredOrdersCount, 3);
  assert.equal(result.shippedOrdersCount, 2);
  assert.equal(result.returnedOrdersCount, 2);
  assert.equal(result.pendingOrdersCount, 1);
  assert.equal(result.cancelledOrdersCount, 1);
  assert.equal(result.totalOrdersCount, 9);

  // Delivery fees (delivered only): Colissimo (8 + 8) + InstaDelivery (7.5) = 23.5 DT
  assert.equal(result.totalDeliveryFees, 23.5);

  // Return fees (returned only): Colissimo (3) + InstaDelivery (3.5) = 6.5 DT
  assert.equal(result.totalReturnFees, 6.5);

  // Withholding Tax: Colissimo 1.5% on (100 + 150 = 250) = 3.75 DT; InstaDelivery 1.0% on 200 = 2.0 DT => Total = 5.75 DT
  assert.equal(result.totalWithholdingTax, 5.75);

  // COGS: 30 + 45 + 60 = 135 DT
  assert.equal(result.totalProductCosts, 135);

  // Net due from carriers = CA - (Delivery + Return + WHT) = 450 - (23.5 + 6.5 + 5.75) = 414.25 DT
  assert.equal(result.netDueFromCarriers, 414.25);

  // Bénéfice Net = CA - COGS - DeliveryFees - ReturnFees - WHT - OPEX (0) = 450 - 135 - 23.5 - 6.5 - 5.75 = 279.25 DT
  assert.equal(result.netProfit, 279.25);

  console.log("✓ Delivered vs Shipped vs Returned order segregation passed.");
}

// ─── 6. Regression Test: Elimination of Duplicate Deductions ──────────────────
{
  const orders: RawOrder[] = [
    { id: "o1", status: "DELIVERED", revenue: 200, cost: 50, shippingProvider: "COLISSIMO" },
  ];

  const expenses: RawExpense[] = [
    // Carrier logistics expense (DUPLICATE - should NOT be deducted twice)
    { id: "e1", name: "Frais de livraison Colissimo", amount: 8, category: "LOGISTICS", isActive: true },
    { id: "e2", name: "Transport Colis", amount: 15, category: "Livraison", isActive: true },
    // Marketing expense
    { id: "e3", name: "Campagne Facebook Conversion", amount: 50, category: "ADS", source: "META_ADS", isActive: true },
    // Operating charges
    { id: "e4", name: "Abonnement Shopify / Outils", amount: 30, category: "TOOLS", isActive: true },
    // General expense
    { id: "e5", name: "Fournitures bureau", amount: 10, category: "AUTRE", isActive: true },
    // Inactive expense (must be ignored)
    { id: "e6", name: "Ancien outil", amount: 100, category: "TOOLS", isActive: false },
  ];

  const transactions: RawTransaction[] = [
    // Duplicate logistics transaction (should be ignored)
    { id: "t1", amount: 8, type: "EXPENSE", category: "Logistics" },
    // Duplicate Ads transaction (already covered by e3 Meta Ads)
    { id: "t2", amount: 50, type: "EXPENSE", category: "Ads" },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses,
    transactions,
    settingsList: defaultSettingsList,
  });

  // Chiffre d'affaires = 200 DT
  assert.equal(result.chiffreAffaires, 200);
  // Delivery fee from order = 8 DT
  assert.equal(result.totalDeliveryFees, 8);
  // Withholding tax = 200 * 1.5% = 3 DT
  assert.equal(result.totalWithholdingTax, 3);
  // Product costs = 50 DT
  assert.equal(result.totalProductCosts, 50);

  // Marketing: e3 = 50 DT (t2 duplicate avoided)
  assert.equal(result.adExpenses, 50);

  // Operational charges: e4 = 30 DT
  assert.equal(result.operationalCharges, 30);

  // Other expenses: e5 = 10 DT
  assert.equal(result.otherExpenses, 10);

  // Total OPEX = 50 + 30 + 10 = 90 DT (e1 and e2 logistics fees were NOT double-counted!)
  const totalOpex = result.adExpenses + result.operationalCharges + result.otherExpenses;
  assert.equal(totalOpex, 90);

  // Bénéfice Net = 200 - 50 (COGS) - 8 (Delivery) - 3 (WHT) - 90 (OPEX) = 49 DT
  assert.equal(result.netProfit, 49);

  // Total Expenses = 50 + 8 + 3 + 90 = 151 DT
  assert.equal(result.totalExpenses, 151);
  assert.equal(round2(result.chiffreAffaires - result.totalExpenses), result.netProfit);

  console.log("✓ Duplicate expense elimination (Logistics & Ads) passed.");
}

// ─── 7. Regression Test: Paid Amount vs Remaining Amount & Validation ─────────
{
  // 3 delivered orders: CA = 300 DT, Delivery fees = 24 DT, WHT = 4.5 DT => Net Due = 271.5 DT
  const orders: RawOrder[] = [
    {
      id: "o1",
      status: "DELIVERED",
      revenue: 100,
      cost: 30,
      shippingProvider: "COLISSIMO",
      deliveryRevenues: [
        { id: "r1", amount: 100, deliveryFee: 8, withholdingTaxApplied: 1.5, isValidated: true, paymentStatus: "VALIDATED" },
      ],
    },
    {
      id: "o2",
      status: "DELIVERED",
      revenue: 100,
      cost: 30,
      shippingProvider: "COLISSIMO",
      financeStatus: "VALIDATED",
    },
    {
      id: "o3",
      status: "DELIVERED",
      revenue: 100,
      cost: 30,
      shippingProvider: "COLISSIMO",
      // Unvalidated order
      deliveryRevenues: [
        { id: "r3", amount: 100, isValidated: false, paymentStatus: "PENDING" },
      ],
    },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  assert.equal(result.chiffreAffaires, 300);
  assert.equal(result.totalDeliveryFees, 24);
  assert.equal(result.totalWithholdingTax, 4.5);
  assert.equal(result.netDueFromCarriers, 271.5);

  // 2 out of 3 orders are validated (o1 and o2):
  // Validated CA = 200 DT
  assert.equal(result.totalValidatedCA, 200);

  // Net paid for o1 = 100 - 8 - 1.5 = 90.5 DT
  // Net paid for o2 = 100 - 8 - 1.5 = 90.5 DT
  // Total paidAmount = 181 DT
  assert.equal(result.paidAmount, 181);

  // Remaining Amount (pending carrier receivable) = 271.5 - 181 = 90.5 DT
  assert.equal(result.remainingAmount, 90.5);

  // Collection rate = (181 / 271.5) * 100 = 66.67%
  assert.equal(result.collectionRate, 66.67);

  console.log("✓ Paid amount, pending receivables, and validation logic passed.");
}

// ─── 8. Regression Test: Unvalidated Cohort Fallback Check ─────────────────────
{
  const orders: RawOrder[] = [
    { id: "o1", status: "DELIVERED", revenue: 150, cost: 40, shippingProvider: "COLISSIMO" },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // When no orders are validated:
  assert.equal(result.chiffreAffaires, 150);
  assert.equal(result.totalValidatedCA, 0); // Must be 0, NOT fallback to 150!
  assert.equal(result.paidAmount, 0);
  // Net Due = 150 - 8 - 2.25 = 139.75 DT
  assert.equal(result.remainingAmount, 139.75);
  assert.equal(result.collectionRate, 0);

  console.log("✓ Zero-validation fallback fix verified.");
}

// ─── 9. Regression Test: Provider-level Breakdown ──────────────────────────────
{
  const orders: RawOrder[] = [
    { id: "o1", status: "DELIVERED", revenue: 100, cost: 20, shippingProvider: "COLISSIMO" },
    { id: "o2", status: "RETURNED", revenue: 100, cost: 20, shippingProvider: "COLISSIMO" },
    { id: "o3", status: "DELIVERED", revenue: 200, cost: 50, shippingProvider: "COSMOS" },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  const colissimo = result.byProvider.find(p => p.provider === "COLISSIMO");
  assert.ok(colissimo);
  assert.equal(colissimo.chiffreAffaires, 100);
  assert.equal(colissimo.deliveryFees, 8);
  assert.equal(colissimo.returnFees, 3);
  assert.equal(colissimo.withholdingTax, 1.5);
  assert.equal(colissimo.netDue, 100 - 8 - 3 - 1.5);
  assert.equal(colissimo.orderCount, 2);
  assert.equal(colissimo.deliveredCount, 1);
  assert.equal(colissimo.returnedCount, 1);

  const cosmos = result.byProvider.find(p => p.provider === "COSMOS");
  assert.ok(cosmos);
  assert.equal(cosmos.chiffreAffaires, 200);
  assert.equal(cosmos.deliveryFees, 8);
  assert.equal(cosmos.withholdingTax, 0); // 0% WHT for COSMOS setting
  assert.equal(cosmos.netDue, 200 - 8);

  console.log("✓ Provider-level breakdown verified.");
}

console.log("\n========================================================");
console.log("🎉 ALL FINANCIAL REGRESSION TESTS PASSED SUCCESSFULLY! ✓");
console.log("========================================================\n");
