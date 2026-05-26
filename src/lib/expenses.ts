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

export type MetaAdsCsvPayment = {
  rowNumber: number;
  dateKey: string;
  date: Date;
  transactionId: string;
  amountUsd: number;
  currency: string;
};

export type MetaAdsCsvDailyImport = {
  dateKey: string;
  date: Date;
  externalId: string;
  amountUsd: number;
  exchangeRate: number;
  amountTnd: number;
  transactionIds: string[];
  rowNumbers: number[];
  description: string;
  metadata: {
    importType: "META_ADS_BILLING_CSV";
    dateKey: string;
    currency: "USD";
    exchangeRate: number;
    transactionIds: string[];
    rowNumbers: number[];
    paymentsCount: number;
  };
};

export type MetaAdsCsvParseResult = {
  payments: MetaAdsCsvPayment[];
  dailyImports: MetaAdsCsvDailyImport[];
  skipped: number;
  errors: string[];
  totalUsd: number;
  totalTnd: number;
};

type CsvRow = {
  rowNumber: number;
  cells: string[];
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

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeCsvCell(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/\u00a0/g, " ").trim();
}

function normalizeCsvHeader(value: string) {
  return normalizeCsvCell(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseCsvRows(input: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let cell = "";
  let rowNumber = 1;
  let currentRowNumber = 1;
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(normalizeCsvCell(cell));
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      row.push(normalizeCsvCell(cell));
      cell = "";
      rows.push({ rowNumber: currentRowNumber, cells: row });
      row = [];

      if (char === "\r" && next === "\n") {
        index += 1;
      }

      rowNumber += 1;
      currentRowNumber = rowNumber;
      continue;
    }

    cell += char;
  }

  row.push(normalizeCsvCell(cell));

  if (row.some((value) => value !== "") || input.endsWith(",")) {
    rows.push({ rowNumber: currentRowNumber, cells: row });
  }

  return rows;
}

function parseMetaAdsDate(value: string) {
  const trimmed = normalizeCsvCell(value);
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;

  const [, dayValue, monthValue, yearValue] = match;
  const day = Number.parseInt(dayValue, 10);
  const month = Number.parseInt(monthValue, 10);
  const year = Number.parseInt(yearValue, 10);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return {
    date,
    dateKey: `${yearValue}-${monthValue}-${dayValue}`,
  };
}

function parseMetaAdsCsvAmount(value: string) {
  const compact = normalizeCsvCell(value).replace(/\s/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const normalized =
    lastComma > lastDot
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(/,/g, "");

  if (!normalized) return null;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isMetaAdsTotalRow(cells: string[]) {
  return cells.some((cell) => normalizeCsvHeader(cell).includes("montant total facture"));
}

function buildMetaAdsDailyImportExternalId(dateKey: string) {
  return `meta-ads-daily:${dateKey}`;
}

export function parseMetaAdsBillingCsv(
  csvText: string,
  exchangeRate: number
): MetaAdsCsvParseResult {
  const rows = parseCsvRows(csvText);
  const errors: string[] = [];

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    return {
      payments: [],
      dailyImports: [],
      skipped: 0,
      errors: ["Le taux de change est requis et doit être supérieur à 0."],
      totalUsd: 0,
      totalTnd: 0,
    };
  }

  const headerIndex = rows.findIndex(({ cells }) => {
    const headers = cells.map(normalizeCsvHeader);
    return (
      headers.includes("date") &&
      headers.includes("id de transaction") &&
      headers.includes("montant") &&
      headers.includes("devise")
    );
  });

  if (headerIndex < 0) {
    return {
      payments: [],
      dailyImports: [],
      skipped: rows.length,
      errors: ["Table de paiements Meta Ads introuvable dans le fichier CSV."],
      totalUsd: 0,
      totalTnd: 0,
    };
  }

  const headers = rows[headerIndex].cells.map(normalizeCsvHeader);
  const dateColumn = headers.indexOf("date");
  const transactionColumn = headers.indexOf("id de transaction");
  const amountColumn = headers.indexOf("montant");
  const currencyColumn = headers.indexOf("devise");

  const payments: MetaAdsCsvPayment[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    const cells = row.cells;

    if (cells.every((cell) => !cell)) {
      if (payments.length > 0) break;
      continue;
    }

    if (isMetaAdsTotalRow(cells)) {
      skipped += 1;
      continue;
    }

    const parsedDate = parseMetaAdsDate(cells[dateColumn] ?? "");
    const transactionId = normalizeCsvCell(cells[transactionColumn] ?? "");
    const amountUsd = parseMetaAdsCsvAmount(cells[amountColumn] ?? "");
    const currency = normalizeCsvCell(cells[currencyColumn] ?? "").toUpperCase();

    if (!parsedDate || !transactionId || !amountUsd || !currency) {
      skipped += 1;
      errors.push(`Ligne ${row.rowNumber}: paiement Meta Ads incomplet ou invalide.`);
      continue;
    }

    if (currency !== "USD") {
      skipped += 1;
      errors.push(`Ligne ${row.rowNumber}: devise non prise en charge (${currency}).`);
      continue;
    }

    payments.push({
      rowNumber: row.rowNumber,
      dateKey: parsedDate.dateKey,
      date: parsedDate.date,
      transactionId,
      amountUsd,
      currency,
    });
  }

  const byDate = new Map<
    string,
    {
      date: Date;
      amountUsd: number;
      transactionIds: string[];
      rowNumbers: number[];
    }
  >();

  for (const payment of payments) {
    const existing = byDate.get(payment.dateKey);

    if (existing) {
      existing.amountUsd += payment.amountUsd;
      existing.transactionIds.push(payment.transactionId);
      existing.rowNumbers.push(payment.rowNumber);
    } else {
      byDate.set(payment.dateKey, {
        date: payment.date,
        amountUsd: payment.amountUsd,
        transactionIds: [payment.transactionId],
        rowNumbers: [payment.rowNumber],
      });
    }
  }

  const dailyImports = Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, day]) => {
      const amountUsd = roundCurrency(day.amountUsd);
      const amountTnd = calculateAmountTnd(amountUsd, exchangeRate);
      const paymentsCount = day.transactionIds.length;

      return {
        dateKey,
        date: day.date,
        externalId: buildMetaAdsDailyImportExternalId(dateKey),
        amountUsd,
        exchangeRate,
        amountTnd,
        transactionIds: day.transactionIds,
        rowNumbers: day.rowNumbers,
        description: `Import CSV Meta Ads - ${dateKey} (${paymentsCount} transaction${paymentsCount > 1 ? "s" : ""})`,
        metadata: {
          importType: "META_ADS_BILLING_CSV" as const,
          dateKey,
          currency: "USD" as const,
          exchangeRate,
          transactionIds: day.transactionIds,
          rowNumbers: day.rowNumbers,
          paymentsCount,
        },
      };
    });

  const totalUsd = roundCurrency(
    dailyImports.reduce((sum, day) => sum + day.amountUsd, 0)
  );
  const totalTnd =
    Math.round(
      (dailyImports.reduce((sum, day) => sum + day.amountTnd, 0) + Number.EPSILON) *
        1000
    ) / 1000;

  if (!dailyImports.length && !errors.length) {
    errors.push("Aucune ligne de paiement Meta Ads valide trouvée dans le fichier.");
  }

  return {
    payments,
    dailyImports,
    skipped,
    errors,
    totalUsd,
    totalTnd,
  };
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
