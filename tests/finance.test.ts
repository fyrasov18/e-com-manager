import assert from "node:assert/strict";
import {
  calculateWithholdingTax,
  calculateOrderFinance,
  normalizeFinanceProvider,
  isDeliveredStatus,
  isReturnStatus,
  round2,
  calculateFinanceFromData,
  calculateStockValuation,
  type RawOrder,
  type RawExpense,
  type RawTransaction,
  type RawProductStockData,
} from "../src/lib/finance";

console.log("▶ Running Comprehensive Financial Calculation Engine Test Suite (15 Critical Tests)...");

// Helper unit checks
assert.equal(normalizeFinanceProvider("COLISSIMO_TN"), "COLISSIMO");
assert.equal(isDeliveredStatus("LIVRE"), true);
assert.equal(isReturnStatus("RETOUR"), true);
assert.equal(calculateWithholdingTax(100, 1.5), 1.5);
assert.equal(round2(10.555), 10.56);
assert.equal(
  calculateOrderFinance({
    totalAmount: 100,
    status: "LIVRE",
    settings: { deliveryCost: 8, returnCost: 3, withholdingTaxPercent: 1.5 },
  }).validatedRevenue,
  100
);

const defaultSettingsList = [
  { provider: "COLISSIMO", deliveryCost: 8, returnCost: 3, withholdingTaxPercent: 1.5 },
  { provider: "INSTADELIVERY", deliveryCost: 7.5, returnCost: 3.5, withholdingTaxPercent: 1.0 },
  { provider: "COSMOS", deliveryCost: 8, returnCost: 3, withholdingTaxPercent: 0 },
  { provider: "INTIGO", deliveryCost: 7, returnCost: 2.5, withholdingTaxPercent: 0 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. COD REVENUE
// ─────────────────────────────────────────────────────────────────────────────
{
  const orders: RawOrder[] = [
    { id: "cod-1", status: "DELIVERED", revenue: 150, shippingProvider: "COLISSIMO" },
    { id: "cod-2", status: "LIVRE", revenue: 250, shippingProvider: "INSTADELIVERY" },
    { id: "cod-pending", status: "PENDING", revenue: 100, shippingProvider: "COLISSIMO" },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // Chiffre d'affaires must include delivered COD sales: 150 + 250 = 400 DT
  assert.equal(result.chiffreAffaires, 400);
  assert.equal(result.deliveredOrdersCount, 2);
  assert.equal(result.pendingOrdersCount, 1);
  console.log("✓ Test 1 Passed: COD revenue accurately recognized for delivered orders.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. COD REVENUE ALREADY INCLUDED IN ORDER TOTALS (NO DOUBLE COUNTING)
// ─────────────────────────────────────────────────────────────────────────────
{
  const orders: RawOrder[] = [
    {
      id: "cod-dup-1",
      status: "DELIVERED",
      revenue: 180, // COD amount already in order
      shippingProvider: "COLISSIMO",
      deliveryRevenues: [
        {
          id: "dr-1",
          amount: 180, // Courier also reported same COD collected
          deliveryFee: 8,
          withholdingTaxApplied: 2.7,
          isValidated: true,
        },
      ],
    },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // Revenue must be 180 DT, NOT 180 + 180 = 360 DT!
  assert.equal(result.chiffreAffaires, 180);
  assert.equal(result.totalRevenue, 180);
  console.log("✓ Test 2 Passed: COD revenue already in order totals is not double counted with courier amounts.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DELIVERY FEES
// ─────────────────────────────────────────────────────────────────────────────
{
  const orders: RawOrder[] = [
    { id: "df-1", status: "DELIVERED", revenue: 100, shippingProvider: "COLISSIMO" }, // 8 DT setting
    { id: "df-2", status: "LIVRE", revenue: 100, deliveryCostApplied: 9.5, shippingProvider: "INSTADELIVERY" }, // explicit 9.5 DT
    { id: "df-3", status: "SHIPPED", revenue: 100, shippingProvider: "COLISSIMO" }, // in transit - 0 delivery fee applied
    { id: "df-4", status: "RETURNED", revenue: 100, shippingProvider: "COLISSIMO" }, // returned - 0 delivery fee applied
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // Delivery fees apply strictly to delivered orders: 8 + 9.5 = 17.5 DT
  assert.equal(result.totalDeliveryFees, 17.5);
  console.log("✓ Test 3 Passed: Delivery fees applied strictly to delivered orders.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. RETURN FEES
// ─────────────────────────────────────────────────────────────────────────────
{
  const orders: RawOrder[] = [
    { id: "rf-1", status: "RETURNED", revenue: 100, shippingProvider: "COLISSIMO" }, // 3 DT setting
    { id: "rf-2", status: "RETOUR_RECU", revenue: 120, returnCostApplied: 4.5, shippingProvider: "INSTADELIVERY" }, // explicit 4.5 DT
    { id: "rf-3", status: "DELIVERED", revenue: 100, shippingProvider: "COLISSIMO" }, // delivered - 0 return fee
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // Return fees apply strictly to returned orders: 3 + 4.5 = 7.5 DT
  assert.equal(result.totalReturnFees, 7.5);
  assert.equal(result.returnedOrdersCount, 2);
  console.log("✓ Test 4 Passed: Return fees applied strictly to returned orders.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. WITHHOLDING TAX (RETENUE À LA SOURCE)
// ─────────────────────────────────────────────────────────────────────────────
{
  const orders: RawOrder[] = [
    { id: "wht-1", status: "DELIVERED", revenue: 200, shippingProvider: "COLISSIMO" }, // 1.5% of 200 = 3 DT
    { id: "wht-2", status: "LIVRE", revenue: 300, withholdingTaxApplied: 4.5, shippingProvider: "INSTADELIVERY" }, // explicit 4.5 DT
    { id: "wht-3", status: "RETURNED", revenue: 200, shippingProvider: "COLISSIMO" }, // returned - 0 WHT
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // WHT: 3 + 4.5 = 7.5 DT
  assert.equal(result.totalWithholdingTax, 7.5);
  assert.equal(result.totalLogisticsAndTax, result.totalDeliveryFees + result.totalReturnFees + 7.5);
  console.log("✓ Test 5 Passed: Withholding tax applied accurately and grouped with logistics deductions.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. GENERAL EXPENSES (EXCLUDING CARRIER DUPLICATES & ADS)
// ─────────────────────────────────────────────────────────────────────────────
{
  const expenses: RawExpense[] = [
    { id: "ge-1", name: "Cartons et emballages", amount: 65, category: "Packaging", isActive: true },
    { id: "ge-2", name: "Abonnement Shopify", amount: 95, category: "Outils", isActive: true },
    { id: "ge-3", name: "Fournitures bureau", amount: 40, category: "BUREAU", isActive: true },
    // Duplicate carrier fees (MUST BE EXCLUDED)
    { id: "ge-dup-1", name: "Frais de livraison Colissimo", amount: 8, category: "Livraison", isActive: true },
    { id: "ge-dup-2", name: "Colissimo Transport", amount: 20, category: "LOGISTICS", isActive: true },
    // Inactive expense (MUST BE EXCLUDED)
    { id: "ge-inact", name: "Vieux serveur", amount: 300, category: "Outils", isActive: false },
  ];

  const result = calculateFinanceFromData({
    orders: [],
    expenses,
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // General expenses = 65 + 95 + 40 = 200 DT
  assert.equal(result.generalExpenses, 200);
  assert.equal(result.otherExpenses, 200);
  console.log("✓ Test 6 Passed: General expenses include operating costs and exclude duplicate carrier fees.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. META ADS EXPENSES (SEPARATE & CONVERTED)
// ─────────────────────────────────────────────────────────────────────────────
{
  const expenses: RawExpense[] = [
    {
      id: "meta-1",
      name: "Meta Ads - Conversion Campagne",
      amount: 155, // 50 USD * 3.10
      source: "META_ADS",
      category: "Publicité",
      isActive: true,
    },
    {
      id: "meta-2",
      name: "Campagne Facebook Retargeting",
      amount: 62, // 20 USD * 3.10
      source: "META_ADS",
      category: "Publicité",
      isActive: true,
    },
    {
      id: "gen-exp",
      name: "Scotch adhésif",
      amount: 25,
      category: "Fournitures",
      isActive: true,
    },
  ];

  const result = calculateFinanceFromData({
    orders: [],
    expenses,
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // Meta Ads = 155 + 62 = 217 DT
  assert.equal(result.metaAdsExpenses, 217);
  assert.equal(result.adExpenses, 217);
  // General expenses must NOT include Meta Ads: 25 DT
  assert.equal(result.generalExpenses, 25);
  console.log("✓ Test 7 Passed: Meta Ads expenses separated and excluded from general expenses.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. VALIDATED COURIER PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────
{
  const orders: RawOrder[] = [
    // Validated by deliveryRevenue
    {
      id: "val-1",
      status: "DELIVERED",
      revenue: 100,
      shippingProvider: "COLISSIMO",
      deliveryRevenues: [
        { id: "dr-v1", amount: 100, deliveryFee: 8, withholdingTaxApplied: 1.5, isValidated: true, paymentStatus: "VALIDATED" },
      ],
    },
    // Validated by status PAID_DELIVERED
    {
      id: "val-2",
      status: "PAID_DELIVERED",
      revenue: 150,
      shippingProvider: "COLISSIMO", // 150 - 8 - 2.25 = 139.75
    },
    // Unvalidated order (still pending with carrier)
    {
      id: "unval-3",
      status: "DELIVERED",
      revenue: 200,
      shippingProvider: "COLISSIMO",
      deliveryRevenues: [
        { id: "dr-p1", amount: 200, isValidated: false, paymentStatus: "PENDING" },
      ],
    },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // Validated orders: val-1 (net 90.5 DT) + val-2 (net 139.75 DT) = 230.25 DT
  assert.equal(result.paidAmount, 230.25);
  // Validated gross CA: 100 + 150 = 250 DT
  assert.equal(result.totalValidatedCA, 250);
  console.log("✓ Test 8 Passed: Validated courier payments accurately filter confirmed settlements.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. PENDING COURIER PAYMENTS (RÉCONCILIATION & CREANCES)
// ─────────────────────────────────────────────────────────────────────────────
{
  const orders: RawOrder[] = [
    {
      id: "rec-1",
      status: "DELIVERED",
      revenue: 200, // Net due = 200 - 8 - 3 = 189 DT
      shippingProvider: "COLISSIMO",
      deliveryRevenues: [
        { id: "dr-1", amount: 200, deliveryFee: 8, withholdingTaxApplied: 3, isValidated: true },
      ],
    },
    {
      id: "rec-2",
      status: "DELIVERED",
      revenue: 200, // Net due = 200 - 8 - 3 = 189 DT, NOT yet validated
      shippingProvider: "COLISSIMO",
      deliveryRevenues: [
        { id: "dr-2", amount: 200, deliveryFee: 8, withholdingTaxApplied: 3, isValidated: false },
      ],
    },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // Total CA = 400 DT
  // Total deductions = (8 + 8) + (3 + 3) = 22 DT
  // Net Due from carrier = 378 DT
  assert.equal(result.netDueFromCarriers, 378);
  // Paid amount = 189 DT
  assert.equal(result.paidAmount, 189);
  // Remaining pending payment = 378 - 189 = 189 DT
  assert.equal(result.remainingAmount, 189);
  assert.equal(result.pendingAmount, 189);
  // Collection rate = 50%
  assert.equal(result.collectionRate, 50);
  console.log("✓ Test 9 Passed: Pending courier payments and collection rate calculated correctly.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. DUPLICATE FINANCIAL RECORDS
// ─────────────────────────────────────────────────────────────────────────────
{
  const orders: RawOrder[] = [
    { id: "o-dup", status: "DELIVERED", revenue: 150, cost: 40, shippingProvider: "COLISSIMO" },
  ];

  const expenses: RawExpense[] = [
    { id: "e-carrier", name: "Frais de livraison Colissimo", amount: 8, category: "LOGISTICS", isActive: true },
    { id: "e-ads", name: "Meta Ads Campagne", amount: 50, category: "Publicité", source: "META_ADS", isActive: true },
    { id: "e-box", name: "Cartons emballage", amount: 20, category: "Packaging", isActive: true },
  ];

  const transactions: RawTransaction[] = [
    // Duplicate carrier transaction
    { id: "tx-dup-1", amount: 8, type: "EXPENSE", category: "Logistics" },
    // Duplicate ad transaction (already in e-ads)
    { id: "tx-dup-2", amount: 50, type: "EXPENSE", category: "Ads" },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses,
    transactions,
    settingsList: defaultSettingsList,
  });

  assert.equal(result.totalDeliveryFees, 8);
  assert.equal(result.metaAdsExpenses, 50);
  assert.equal(result.generalExpenses, 20); // only e-box counted
  // Ensure no duplicate deduction occurred in net profit
  // CA (150) - COGS (40) - Del (8) - WHT (2.25) - Ads (50) - Gen (20) = 29.75 DT
  assert.equal(result.netProfit, 29.75);
  console.log("✓ Test 10 Passed: Duplicate financial records eliminated across expenses and transactions.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. STOCK PURCHASES WITH UNSOLD INVENTORY (STOCK ACCOUNTING RULE)
// ─────────────────────────────────────────────────────────────────────────────
{
  // Merchant bought 1,000 DT of stock (e.g. 50 units at 20 DT)
  // Sold 10 units at 50 DT each (cost = 200 DT). 40 units remain in warehouse (800 DT asset).
  const orders: RawOrder[] = [
    { id: "stock-ord", status: "DELIVERED", revenue: 500, cost: 200, shippingProvider: "COLISSIMO" },
  ];

  const expenses: RawExpense[] = [
    // Stock purchase cash outflow:
    { id: "exp-stock", name: "Achat de stock 50 pièces", amount: 1000, category: "Stock", isActive: true },
    // Operating expense:
    { id: "exp-op", name: "Ruban adhésif", amount: 30, category: "Fournitures", isActive: true },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses,
    transactions: [],
    settingsList: defaultSettingsList,
    stockValuation: {
      stockValue: 800, // 40 units * 20 DT unsold
      totalStockQuantity: 40,
      totalProductsCount: 1,
      lowStockCount: 0,
    },
  });

  // COGS for sold products = 200 DT
  assert.equal(result.totalProductCosts, 200);
  // Stock purchase is tracked in cash flow, NOT deducted twice from net profit:
  assert.equal(result.stockPurchasesCashFlow, 1000);
  assert.equal(result.generalExpenses, 30);
  // Unsold stock sits as an asset on the balance sheet:
  assert.equal(result.stockValue, 800);

  // Accounting Net Profit: CA (500) - COGS (200) - Del (8) - WHT (7.5) - Gen (30) = 254.5 DT
  assert.equal(result.netProfit, 254.5);
  console.log("✓ Test 11 Passed: Stock purchases with unsold inventory capitalized without penalizing net profit.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. COST OF GOODS SOLD (COGS)
// ─────────────────────────────────────────────────────────────────────────────
{
  const orders: RawOrder[] = [
    { id: "cogs-1", status: "DELIVERED", revenue: 100, cost: 35, shippingProvider: "COLISSIMO" },
    { id: "cogs-2", status: "PAID_DELIVERED", revenue: 140, cost: 45, shippingProvider: "COLISSIMO" },
    // Pending order (NOT delivered yet - product not yet recognized as COGS)
    { id: "cogs-pend", status: "PENDING", revenue: 120, cost: 40, shippingProvider: "COLISSIMO" },
  ];

  const result = calculateFinanceFromData({
    orders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  // COGS = 35 + 45 = 80 DT (pending order cost of 40 DT is NOT recognized as COGS)
  assert.equal(result.totalProductCosts, 80);
  console.log("✓ Test 12 Passed: COGS calculated strictly from delivered sales.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. AVAILABLE STOCK VALUATION
// ─────────────────────────────────────────────────────────────────────────────
{
  const products: RawProductStockData[] = [
    // Product with purchase price from purchase invoice movement
    {
      id: "p1",
      sku: "PROD-A",
      stockQuantity: 25,
      lowStockThreshold: 5,
      stockMovements: [{ unitCost: 18.5 }],
    },
    // Product with purchase price from orders fallback
    {
      id: "p2",
      sku: "PROD-B",
      stockQuantity: 10,
      lowStockThreshold: 5,
      orders: [{ cost: 150, quantity: 5 }], // unit cost = 30 DT
    },
    // Negative stock safeguarding (floored to 0)
    {
      id: "p3",
      sku: "PROD-C",
      stockQuantity: -2,
      purchasePrice: 20,
    },
  ];

  const valuation = calculateStockValuation(products);

  // p1: 25 * 18.5 = 462.5 DT
  // p2: 10 * 30 = 300 DT
  // p3: max(0, -2) * 20 = 0 DT
  // Total Stock Value = 762.5 DT
  assert.equal(valuation.stockValue, 762.5);
  assert.equal(valuation.totalStockQuantity, 35);
  assert.equal(valuation.totalProductsCount, 3);
  assert.equal(valuation.lowStockCount, 1); // p3 (0 <= 5)
  console.log("✓ Test 13 Passed: Available stock valuation computed strictly on actual purchase price.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. PRODUCT VARIANTS
// ─────────────────────────────────────────────────────────────────────────────
{
  const products: RawProductStockData[] = [
    { id: "v1-s", sku: "TSHIRT-BLK-S", stockQuantity: 15, purchasePrice: 12 },
    { id: "v1-m", sku: "TSHIRT-BLK-M", stockQuantity: 30, purchasePrice: 12 },
    { id: "v1-l", sku: "TSHIRT-BLK-L", stockQuantity: 20, purchasePrice: 14 },
  ];

  const valuation = calculateStockValuation(products);

  // 15*12 + 30*12 + 20*14 = 180 + 360 + 280 = 820 DT
  assert.equal(valuation.stockValue, 820);
  assert.equal(valuation.totalStockQuantity, 65);
  console.log("✓ Test 14 Passed: Product variants inventory valuation and stock levels verified.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. MONTHLY AND YEARLY FILTERS
// ─────────────────────────────────────────────────────────────────────────────
{
  const jan1 = new Date("2026-01-01T00:00:00Z");
  const jan31 = new Date("2026-01-31T23:59:59Z");
  const feb1 = new Date("2026-02-01T00:00:00Z");

  const orders: RawOrder[] = [
    { id: "o-jan", status: "DELIVERED", revenue: 300, date: jan1, shippingProvider: "COLISSIMO" },
    { id: "o-feb", status: "DELIVERED", revenue: 500, date: feb1, shippingProvider: "COLISSIMO" },
  ];

  // Simulating filter for January only:
  const janOrders = orders.filter((o) => {
    const d = new Date(o.date || "");
    return d >= jan1 && d <= jan31;
  });

  const janResult = calculateFinanceFromData({
    orders: janOrders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  assert.equal(janResult.chiffreAffaires, 300);
  assert.equal(janResult.deliveredOrdersCount, 1);

  // Simulating filter for full Year 2026:
  const yearOrders = orders.filter((o) => {
    const d = new Date(o.date || "");
    return d.getFullYear() === 2026;
  });

  const yearResult = calculateFinanceFromData({
    orders: yearOrders,
    expenses: [],
    transactions: [],
    settingsList: defaultSettingsList,
  });

  assert.equal(yearResult.chiffreAffaires, 800);
  assert.equal(yearResult.deliveredOrdersCount, 2);
  console.log("✓ Test 15 Passed: Monthly and yearly filters maintain period consistency.");
}

console.log("\n========================================================");
console.log("🎉 ALL 15 FINANCIAL REGRESSION TESTS PASSED SUCCESSFULLY! ✓");
console.log("========================================================\n");
