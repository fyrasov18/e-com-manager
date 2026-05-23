import { prisma } from "@/lib/prisma";

export type ExcelRow = Record<string, unknown>;
export type ColumnMapping = { excelColumn: string; targetField: string };

export type NormalizedOrderImport = {
  reference?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  shippingAddress?: string | null;
  shippingCity?: string | null;
  shippingZip?: string | null;
  revenue?: number | string | null;
  status?: string | null;
  trackingNumber?: string | null;
  shippingProvider?: string | null;
  date?: Date | string | null;
};

export type OrderImportDetail = {
  reference?: string | null;
  trackingNumber?: string | null;
  action: "imported" | "updated" | "skipped" | "failed";
  error?: string;
};

export type OrderImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  details: OrderImportDetail[];
};

type ImportOrdersOptions = {
  source?: string;
  requireCustomerPhone?: boolean;
  requireDedupeKey?: boolean;
  updateExisting?: boolean;
};

function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function parseImportNumber(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const normalized = String(value)
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");

  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseImportDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function normalizeOrderStatus(value: unknown): string {
  const raw = cleanText(value);
  if (!raw) return "PENDING";

  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]/g, " ")
    .trim();

  if (["pending", "en attente", "new", "nouveau"].includes(normalized)) return "PENDING";
  if (["confirmed", "confirme", "paid", "payee", "paye", "processing"].includes(normalized)) return "CONFIRMED";
  if (["prepared", "preparation", "en preparation"].includes(normalized)) return "PROCESSING";
  if (["shipped", "expedie", "expediee", "colis enleve"].includes(normalized)) return "SHIPPED";
  if (["out for delivery", "en cours de livraison"].includes(normalized)) return "OUT_FOR_DELIVERY";
  if (["delivered", "livre", "livree"].includes(normalized)) return "DELIVERED";
  if (["cancelled", "canceled", "annule", "annulee"].includes(normalized)) return "CANCELLED";
  if (["returned", "retourne", "retournee", "retour livre"].includes(normalized)) return "RETURNED";
  if (["failed", "echoue", "echouee"].includes(normalized)) return "FAILED_ATTEMPT";

  return raw.toUpperCase().replace(/\s+/g, "_");
}

export function mapExcelRowToOrder(row: ExcelRow, mappings: ColumnMapping[]): NormalizedOrderImport {
  const order: NormalizedOrderImport = {};

  for (const mapping of mappings) {
    const value = row[mapping.excelColumn];
    if (value === undefined || value === null || value === "") continue;

    if (mapping.targetField === "customerName") order.customerName = cleanText(value);
    if (mapping.targetField === "customerPhone") order.customerPhone = cleanText(value);
    if (mapping.targetField === "shippingAddress") order.shippingAddress = cleanText(value);
    if (mapping.targetField === "revenue") order.revenue = parseImportNumber(value);
    if (mapping.targetField === "status") order.status = cleanText(value);
    if (mapping.targetField === "trackingNumber") order.trackingNumber = cleanText(value);
    if (mapping.targetField === "date") order.date = cleanText(value);
  }

  return order;
}

export async function importExcelOrderRows(
  teamId: string,
  rows: ExcelRow[],
  mappings: ColumnMapping[]
): Promise<OrderImportResult> {
  return importNormalizedOrders(
    teamId,
    rows.map((row) => mapExcelRowToOrder(row, mappings)),
    { source: "EXCEL_IMPORT", requireCustomerPhone: true }
  );
}

async function findExistingOrder(teamId: string, order: Required<Pick<NormalizedOrderImport, "trackingNumber" | "reference">>) {
  const OR: any[] = [];
  if (order.trackingNumber) OR.push({ trackingNumber: order.trackingNumber });
  if (order.reference) OR.push({ reference: order.reference });

  if (OR.length === 0) return null;

  return prisma.order.findFirst({
    where: { teamId, OR },
  });
}

export async function importNormalizedOrders(
  teamId: string,
  orders: NormalizedOrderImport[],
  options: ImportOrdersOptions = {}
): Promise<OrderImportResult> {
  const requireCustomerPhone = options.requireCustomerPhone ?? true;
  const requireDedupeKey = options.requireDedupeKey ?? false;
  const updateExisting = options.updateExisting ?? true;
  const source = cleanText(options.source) ?? "ORDER_IMPORT";

  const result: OrderImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    details: [],
  };

  for (let index = 0; index < orders.length; index++) {
    const raw = orders[index];
    const customerName = cleanText(raw.customerName);
    const customerPhone = cleanText(raw.customerPhone);
    const reference = cleanText(raw.reference);
    const trackingNumber = cleanText(raw.trackingNumber);
    const shippingProvider = cleanText(raw.shippingProvider) ?? source;
    const revenue = parseImportNumber(raw.revenue);
    const status = normalizeOrderStatus(raw.status);
    const date = parseImportDate(raw.date);

    try {
      if (!customerName || (requireCustomerPhone && !customerPhone)) {
        const error = `Ligne ${index + 1} ignoree: client ou telephone manquant`;
        result.skipped++;
        result.errors.push(error);
        result.details.push({ reference, trackingNumber, action: "skipped", error });
        continue;
      }

      if (requireDedupeKey && !trackingNumber && !reference) {
        const error = `Ligne ${index + 1} ignoree: reference ou tracking manquant`;
        result.skipped++;
        result.errors.push(error);
        result.details.push({ reference, trackingNumber, action: "skipped", error });
        continue;
      }

      const existing = await findExistingOrder(teamId, { trackingNumber, reference });

      if (existing && !updateExisting) {
        result.skipped++;
        result.details.push({ reference, trackingNumber, action: "skipped", error: "Commande deja importee" });
        continue;
      }

      const baseData = {
        status,
        revenue,
        profit: revenue,
        customerName,
        customerPhone,
        customerEmail: cleanText(raw.customerEmail),
        shippingAddress: cleanText(raw.shippingAddress),
        shippingCity: cleanText(raw.shippingCity),
        shippingZip: cleanText(raw.shippingZip),
        trackingNumber,
        reference,
        shippingProvider,
        importedAt: new Date(),
        ...(date && { date }),
      };

      if (existing) {
        await prisma.order.update({
          where: { id: existing.id },
          data: {
            ...baseData,
            revenue: revenue || existing.revenue,
            profit: revenue ? revenue - existing.cost : existing.profit,
            customerName: customerName || existing.customerName,
            customerPhone: customerPhone || existing.customerPhone,
            customerEmail: cleanText(raw.customerEmail) || existing.customerEmail,
            shippingAddress: cleanText(raw.shippingAddress) || existing.shippingAddress,
            shippingCity: cleanText(raw.shippingCity) || existing.shippingCity,
            shippingZip: cleanText(raw.shippingZip) || existing.shippingZip,
            trackingNumber: trackingNumber || existing.trackingNumber,
            reference: reference || existing.reference,
            shippingProvider: shippingProvider || existing.shippingProvider,
          },
        });
        result.updated++;
        result.details.push({ reference, trackingNumber, action: "updated" });
      } else {
        await prisma.order.create({
          data: {
            teamId,
            cost: 0,
            ...baseData,
          },
        });
        result.imported++;
        result.details.push({ reference, trackingNumber, action: "imported" });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Erreur import commande";
      console.error("[OrderImport] Order error:", err);
      result.failed++;
      result.errors.push(`Ligne ${index + 1}: ${error}`);
      result.details.push({ reference, trackingNumber, action: "failed", error });
    }
  }

  return result;
}
