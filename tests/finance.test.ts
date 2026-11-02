import assert from "node:assert/strict";
import {
  calculateWithholdingTax,
  calculateOrderFinance,
  normalizeFinanceProvider,
  isDeliveredStatus,
  isReturnStatus,
  round2,
  calculateFinanceMetrics
} from "../src/lib/finance";

// 1. Test normalizeFinanceProvider
assert.equal(normalizeFinanceProvider("Colissimo"), "COLISSIMO");
assert.equal(normalizeFinanceProvider("COLISSIMO_TN"), "COLISSIMO");
assert.equal(normalizeFinanceProvider("InstaDelivery"), "INSTADELIVERY");
assert.equal(normalizeFinanceProvider("INTIGO"), "INTIGO");
assert.equal(normalizeFinanceProvider("Cosmos"), "COSMOS");
assert.equal(normalizeFinanceProvider("AUTRE"), "AUTRE");

// 2. Test calculateWithholdingTax
assert.equal(calculateWithholdingTax(100, 3), 3);
assert.equal(calculateWithholdingTax(150.5, 3), 4.515);
assert.equal(calculateWithholdingTax(100, 0), 0);
assert.equal(calculateWithholdingTax(0, 3), 0);

// 3. Test calculateOrderFinance for DELIVERED order
const deliveredFinance = calculateOrderFinance({
  totalAmount: 150,
  status: "LIVRE",
  settings: {
    deliveryCost: 8,
    returnCost: 3,
    withholdingTaxPercent: 3,
  },
  purchaseCost: 50,
});
assert.equal(deliveredFinance.validatedRevenue, 150);
assert.equal(deliveredFinance.deliveryCostApplied, 8);
assert.equal(deliveredFinance.returnCostApplied, 0);
assert.equal(deliveredFinance.withholdingTaxApplied, 4.5);
assert.equal(deliveredFinance.netProfit, 150 - 8 - 4.5 - 50);

// 4. Test calculateOrderFinance for RETURNED order
const returnedFinance = calculateOrderFinance({
  totalAmount: 150,
  status: "RETOUR",
  settings: {
    deliveryCost: 8,
    returnCost: 5,
    withholdingTaxPercent: 3,
  },
});
assert.equal(returnedFinance.validatedRevenue, 0);
assert.equal(returnedFinance.deliveryCostApplied, 0);
assert.equal(returnedFinance.returnCostApplied, 5);
assert.equal(returnedFinance.withholdingTaxApplied, 0);
assert.equal(returnedFinance.netProfit, -5);

// 5. Test Paiements reçus formula:
// Paiements reçus = CA − (Frais de livraison + Frais de retour + Retenue à la source)
const ca = 9811.18;
const deliveryFees = 1400.0;
const returnFees = 350.0;
const withholdingTax = 292.9;
const expectedPaidAmount = round2(ca - (deliveryFees + returnFees + withholdingTax));
assert.equal(expectedPaidAmount, 7768.28);

// 6. Test Status helpers
assert.equal(isDeliveredStatus("LIVRE"), true);
assert.equal(isDeliveredStatus("PAID_DELIVERED"), true);
assert.equal(isDeliveredStatus("DELIVERED"), true);
assert.equal(isReturnStatus("RETOUR"), true);
assert.equal(isReturnStatus("RETURNED"), true);
assert.equal(isReturnStatus("RETOUR_RECU"), true);

console.log("✅ All Finance unit tests passed successfully!");
