import assert from "node:assert/strict";
import {
  calculateAmountTnd,
  parseMetaAdsBillingCsv,
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

test("parses Meta Ads billing CSV and aggregates daily totals", () => {
  const csv = [
    "Informations Meta",
    "Meta Platforms Ireland Limited,Merrion Road,Dublin 4,D04 X2K5,Ireland",
    "",
    "Paiement Publicites Meta",
    "Date,ID de transaction,Montant,Devise",
    '26/04/2026,tx-1,"7,13",USD',
    '10/04/2026,tx-2,"9,48",USD',
    '10/04/2026,tx-3,"4,74",USD',
    '10/04/2026,tx-4,"2,37",USD',
    ',Montant total facture,"23,72",USD',
    "",
    "VAT Rate: 0%",
  ].join("\n");

  const result = parseMetaAdsBillingCsv(csv, 3.1);

  assert.equal(result.errors.length, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.payments.length, 4);
  assert.equal(result.dailyImports.length, 2);
  assert.equal(result.totalUsd, 23.72);
  assert.equal(result.totalTnd, 73.532);

  const april10 = result.dailyImports.find((day) => day.dateKey === "2026-04-10");
  assert.ok(april10);
  assert.equal(april10.amountUsd, 16.59);
  assert.equal(april10.amountTnd, 51.429);
  assert.deepEqual(april10.transactionIds, ["tx-2", "tx-3", "tx-4"]);
  assert.equal(april10.externalId, "meta-ads-daily:2026-04-10");
});

test("reports invalid and non-USD Meta Ads CSV rows", () => {
  const csv = [
    "Date,ID de transaction,Montant,Devise",
    '26/04/2026,tx-1,"7,13",USD',
    '27/04/2026,tx-2,"8,00",EUR',
    'bad-date,tx-3,"5,00",USD',
  ].join("\n");

  const result = parseMetaAdsBillingCsv(csv, 3.1);

  assert.equal(result.payments.length, 1);
  assert.equal(result.dailyImports.length, 1);
  assert.equal(result.skipped, 2);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /devise non prise en charge/);
  assert.match(result.errors[1], /incomplet ou invalide/);
});
