export const META_ADS_SOURCE = "META_ADS";
export const MANUAL_EXPENSE_SOURCE = "MANUAL";
export const META_ADS_CATEGORY = "Publicité";
export const DEFAULT_USD_TND_RATE = 3.1;

export type MetaAdsExpenseInput = {
  date?: unknown;
  startDate?: unknown;
  amountUsd?: unknown;
  exchangeRate?: unknown;
  note?: unknown;
  description?: unknown;
};

export type ValidMetaAdsExpense = {
  date: Date;
  amountUsd: number;
  exchangeRate: number;
  amountTnd: number;
  note: string | null;
};

export function calculateAmountTnd(amountUsd: number, exchangeRate: number) {
  return Math.round((amountUsd * exchangeRate + Number.EPSILON) * 1000) / 1000;
}

export function parsePositiveNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseExpenseDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return new Date();
  }

  const trimmed = value.trim();
  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = new Date(dateOnlyMatch ? `${trimmed}T00:00:00` : trimmed);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function validateMetaAdsExpenseInput(input: MetaAdsExpenseInput):
  | { success: true; data: ValidMetaAdsExpense }
  | { success: false; error: string } {
  const date = parseExpenseDate(input.date ?? input.startDate);
  if (!date) {
    return { success: false, error: "Date invalide." };
  }

  const amountUsd = parsePositiveNumber(input.amountUsd);
  if (!amountUsd) {
    return {
      success: false,
      error: "Le montant USD est requis et doit être supérieur à 0.",
    };
  }

  const exchangeRate = parsePositiveNumber(input.exchangeRate);
  if (!exchangeRate) {
    return {
      success: false,
      error: "Le taux de change est requis et doit être supérieur à 0.",
    };
  }

  const rawNote = input.note ?? input.description;
  const note = typeof rawNote === "string" ? rawNote.trim() : "";

  return {
    success: true,
    data: {
      date,
      amountUsd,
      exchangeRate,
      amountTnd: calculateAmountTnd(amountUsd, exchangeRate),
      note: note || null,
    },
  };
}
