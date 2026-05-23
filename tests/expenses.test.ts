import assert from "node:assert/strict";
import {
  calculateAmountTnd,
  parsePositiveNumber,
  validateMetaAdsExpenseInput,
} from "../src/lib/expenses";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("calculates Meta Ads TND amount with three decimal precision", () => {
  assert.equal(calculateAmountTnd(12.5, 3.1), 38.75);
  assert.equal(calculateAmountTnd(9.999, 3.123), 31.227);
});

test("accepts positive numeric input with comma or dot decimals", () => {
  assert.equal(parsePositiveNumber("12.50"), 12.5);
  assert.equal(parsePositiveNumber("12,50"), 12.5);
  assert.equal(parsePositiveNumber(3.1), 3.1);
});

test("rejects missing or non-positive Meta Ads values", () => {
  const result = validateMetaAdsExpenseInput({
    date: "2026-05-13",
    amountUsd: "0",
    exchangeRate: "3.10",
  });

  assert.equal(result.success, false);
  assert.equal(
    result.success ? "" : result.error,
    "Le montant USD est requis et doit être supérieur à 0."
  );
});

test("validates and sanitizes Meta Ads expense input", () => {
  const result = validateMetaAdsExpenseInput({
    date: "2026-05-13",
    amountUsd: "12.50",
    exchangeRate: "3.10",
    note: "  campagne test  ",
  });

  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.data.amountUsd, 12.5);
  assert.equal(result.data.exchangeRate, 3.1);
  assert.equal(result.data.amountTnd, 38.75);
  assert.equal(result.data.note, "campagne test");
});
