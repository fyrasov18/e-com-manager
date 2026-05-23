import { prisma } from "@/lib/prisma";
import {
  importNormalizedOrders,
  normalizeOrderStatus,
  parseImportNumber,
  type NormalizedOrderImport,
  type OrderImportResult,
} from "@/lib/order-import";

type AutoOrderImportProvider = "GENERIC" | "SHOPIFY" | "WOOCOMMERCE";

export type AutoOrderImportConfig = {
  enabled: boolean;
  provider: AutoOrderImportProvider;
  url: string | null;
  intervalMinutes: number;
  lookbackHours: number;
  safetyWindowMinutes: number;
  limit: number;
  sinceParam: string | null;
  limitParam: string | null;
  requireCustomerPhone: boolean;
};

export type AutoOrderImportRunResult = {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  provider: AutoOrderImportProvider;
  fetched: number;
  normalized: number;
  importResult: OrderImportResult;
  duration: number;
};

let isAutoOrderImporting = false;
let lastAutoOrderImportAt: Date | null = null;
let lastAutoOrderImportError: string | null = null;

export function getAutoOrderImportStatus() {
  return {
    isAutoOrderImporting,
    lastAutoOrderImportAt,
    lastAutoOrderImportError,
  };
}

function envFlag(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envInt(value: string | undefined, defaultValue: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeProvider(value: string | undefined): AutoOrderImportProvider {
  const provider = (value ?? "GENERIC").trim().toUpperCase();
  if (provider === "SHOPIFY" || provider === "WOOCOMMERCE") return provider;
  return "GENERIC";
}

export function getAutoOrderImportConfig(): AutoOrderImportConfig {
  return {
    enabled: envFlag(process.env.AUTO_ORDER_IMPORT_ENABLED, false),
    provider: normalizeProvider(process.env.AUTO_ORDER_IMPORT_PROVIDER),
    url: process.env.AUTO_ORDER_IMPORT_URL?.trim() || null,
    intervalMinutes: envInt(process.env.AUTO_ORDER_IMPORT_INTERVAL_MINUTES, 15, 1, 24 * 60),
    lookbackHours: envInt(process.env.AUTO_ORDER_IMPORT_LOOKBACK_HOURS, 24, 1, 24 * 30),
    safetyWindowMinutes: envInt(process.env.AUTO_ORDER_IMPORT_SAFETY_WINDOW_MINUTES, 10, 0, 24 * 60),
    limit: envInt(process.env.AUTO_ORDER_IMPORT_LIMIT, 100, 1, 500),
    sinceParam: process.env.AUTO_ORDER_IMPORT_SINCE_PARAM?.trim() || null,
    limitParam: process.env.AUTO_ORDER_IMPORT_LIMIT_PARAM?.trim() || null,
    requireCustomerPhone: envFlag(process.env.AUTO_ORDER_IMPORT_REQUIRE_PHONE, true),
  };
}

export async function getLatestAutoOrderImportLog(teamId: string) {
  return prisma.deliverySyncLog.findFirst({
    where: { teamId, provider: "ORDER_IMPORT" },
    orderBy: { startedAt: "desc" },
  });
}

async function getSinceDate(teamId: string, config: AutoOrderImportConfig): Promise<Date> {
  const latestLog = await getLatestAutoOrderImportLog(teamId);
  const fallback = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000);

  if (!latestLog?.startedAt) return fallback;

  return new Date(latestLog.startedAt.getTime() - config.safetyWindowMinutes * 60 * 1000);
}

function parseAuthHeader(value: string | undefined): [string, string] | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator === -1) return null;
  const name = value.slice(0, separator).trim();
  const headerValue = value.slice(separator + 1).trim();
  if (!name || !headerValue) return null;
  return [name, headerValue];
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };

  const explicitHeader = parseAuthHeader(process.env.AUTO_ORDER_IMPORT_AUTH_HEADER);
  if (explicitHeader) {
    headers[explicitHeader[0]] = explicitHeader[1];
  }

  if (process.env.AUTO_ORDER_IMPORT_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.AUTO_ORDER_IMPORT_BEARER_TOKEN}`;
  }

  const apiKeyHeader = process.env.AUTO_ORDER_IMPORT_API_KEY_HEADER?.trim();
  const apiKey = process.env.AUTO_ORDER_IMPORT_API_KEY?.trim();
  if (apiKeyHeader && apiKey) {
    headers[apiKeyHeader] = apiKey;
  }

  return headers;
}

function buildImportUrl(config: AutoOrderImportConfig, since: Date): string {
  if (!config.url) throw new Error("AUTO_ORDER_IMPORT_URL manquant");

  const url = new URL(config.url);
  if (config.sinceParam) url.searchParams.set(config.sinceParam, since.toISOString());
  if (config.limitParam) url.searchParams.set(config.limitParam, String(config.limit));
  return url.toString();
}

function getByPath(source: unknown, path: string): unknown {
  if (!source || typeof source !== "object") return undefined;

  return path.split(".").reduce<unknown>((current, part) => {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
    if (typeof current === "object") return (current as Record<string, unknown>)[part];
    return undefined;
  }, source);
}

function pick(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned : null;
}

function combineName(...parts: unknown[]): string | null {
  const name = parts.map(text).filter(Boolean).join(" ").trim();
  return name || null;
}

function extractOrderArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  const candidates = [
    "orders",
    "data",
    "items",
    "results",
    "body.orders",
    "payload.orders",
  ];

  for (const path of candidates) {
    const value = getByPath(payload, path);
    if (Array.isArray(value)) return value;
  }

  return [];
}

function normalizeGenericOrder(raw: unknown, provider: AutoOrderImportProvider): NormalizedOrderImport {
  const reference = text(pick(raw, ["reference", "orderNumber", "order_number", "number", "name", "id", "orderId", "order_id"]));

  return {
    reference,
    customerName:
      text(pick(raw, ["customerName", "customer_name", "customer.name", "shipping.name", "billing.name"])) ??
      combineName(pick(raw, ["customer.firstName", "customer.first_name", "billing.first_name"]), pick(raw, ["customer.lastName", "customer.last_name", "billing.last_name"])),
    customerPhone: text(pick(raw, ["customerPhone", "customer_phone", "phone", "customer.phone", "shipping.phone", "billing.phone"])),
    customerEmail: text(pick(raw, ["customerEmail", "customer_email", "email", "customer.email", "billing.email"])),
    shippingAddress:
      text(pick(raw, ["shippingAddress", "shipping_address", "address", "shipping.address", "shipping.address1", "shipping.address_1"])) ??
      text(pick(raw, ["billing.address", "billing.address1", "billing.address_1"])),
    shippingCity: text(pick(raw, ["shippingCity", "shipping_city", "city", "shipping.city", "billing.city"])),
    shippingZip: text(pick(raw, ["shippingZip", "shipping_zip", "zip", "shipping.zip", "shipping.postcode", "billing.postcode"])),
    revenue: parseImportNumber(pick(raw, ["revenue", "total", "amount", "totalPrice", "total_price", "current_total_price"])),
    status: normalizeOrderStatus(pick(raw, ["status", "financial_status", "fulfillment_status", "order_status"])),
    trackingNumber: text(pick(raw, ["trackingNumber", "tracking_number", "tracking", "shipping.trackingNumber", "fulfillments.0.tracking_number"])),
    shippingProvider: text(pick(raw, ["shippingProvider", "shipping_provider", "carrier", "shipping.carrier", "fulfillments.0.tracking_company"])) ?? provider,
    date: text(pick(raw, ["date", "createdAt", "created_at", "date_created", "created"])),
  };
}

function normalizeShopifyOrder(raw: unknown): NormalizedOrderImport {
  return {
    reference: text(pick(raw, ["name", "order_number", "id"])),
    customerName:
      text(pick(raw, ["shipping_address.name", "billing_address.name", "customer.default_address.name"])) ??
      combineName(pick(raw, ["customer.first_name"]), pick(raw, ["customer.last_name"])),
    customerPhone: text(pick(raw, ["shipping_address.phone", "billing_address.phone", "customer.phone", "phone"])),
    customerEmail: text(pick(raw, ["email", "customer.email"])),
    shippingAddress: combineName(pick(raw, ["shipping_address.address1"]), pick(raw, ["shipping_address.address2"])),
    shippingCity: text(pick(raw, ["shipping_address.city", "billing_address.city"])),
    shippingZip: text(pick(raw, ["shipping_address.zip", "billing_address.zip"])),
    revenue: parseImportNumber(pick(raw, ["current_total_price", "total_price", "subtotal_price"])),
    status: normalizeOrderStatus(pick(raw, ["fulfillment_status", "financial_status", "status"])),
    trackingNumber: text(pick(raw, ["fulfillments.0.tracking_number", "fulfillment.tracking_number"])),
    shippingProvider: text(pick(raw, ["fulfillments.0.tracking_company", "shipping_lines.0.title"])) ?? "SHOPIFY",
    date: text(pick(raw, ["created_at", "processed_at", "updated_at"])),
  };
}

function normalizeWooCommerceOrder(raw: unknown): NormalizedOrderImport {
  return {
    reference: text(pick(raw, ["number", "id"])),
    customerName:
      combineName(pick(raw, ["shipping.first_name"]), pick(raw, ["shipping.last_name"])) ??
      combineName(pick(raw, ["billing.first_name"]), pick(raw, ["billing.last_name"])),
    customerPhone: text(pick(raw, ["billing.phone", "shipping.phone"])),
    customerEmail: text(pick(raw, ["billing.email"])),
    shippingAddress: combineName(pick(raw, ["shipping.address_1"]), pick(raw, ["shipping.address_2"])),
    shippingCity: text(pick(raw, ["shipping.city", "billing.city"])),
    shippingZip: text(pick(raw, ["shipping.postcode", "billing.postcode"])),
    revenue: parseImportNumber(pick(raw, ["total", "subtotal"])),
    status: normalizeOrderStatus(pick(raw, ["status"])),
    trackingNumber: text(pick(raw, ["tracking_number", "shipment_tracking.0.tracking_number", "meta_data.0.value.tracking_number"])),
    shippingProvider: text(pick(raw, ["shipping_lines.0.method_title", "shipping_lines.0.method_id"])) ?? "WOOCOMMERCE",
    date: text(pick(raw, ["date_created_gmt", "date_created", "date_modified_gmt"])),
  };
}

function normalizeConnectedOrder(raw: unknown, provider: AutoOrderImportProvider): NormalizedOrderImport {
  if (provider === "SHOPIFY") return normalizeShopifyOrder(raw);
  if (provider === "WOOCOMMERCE") return normalizeWooCommerceOrder(raw);
  return normalizeGenericOrder(raw, provider);
}

async function fetchConnectedOrders(config: AutoOrderImportConfig, since: Date): Promise<unknown[]> {
  const url = buildImportUrl(config, since);
  const response = await fetch(url, {
    method: "GET",
    headers: buildHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Source commandes HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  return extractOrderArray(payload).slice(0, config.limit);
}

async function writeAutoOrderImportLog(
  teamId: string,
  status: "SUCCESS" | "ERROR" | "PARTIAL",
  startedAt: Date,
  result: Partial<AutoOrderImportRunResult>,
  errorMessage?: string
) {
  await prisma.deliverySyncLog.create({
    data: {
      provider: "ORDER_IMPORT",
      status,
      startedAt,
      finishedAt: new Date(),
      ordersCreated: result.importResult?.imported ?? 0,
      ordersUpdated: result.importResult?.updated ?? 0,
      errorsCount: (result.importResult?.failed ?? 0) + (errorMessage ? 1 : 0),
      errorMessage: errorMessage ?? result.importResult?.errors.slice(0, 5).join(" | ") ?? null,
      rawSummary: JSON.stringify({
        provider: result.provider,
        fetched: result.fetched ?? 0,
        normalized: result.normalized ?? 0,
        skipped: result.importResult?.skipped ?? 0,
        failed: result.importResult?.failed ?? 0,
        duration: result.duration ?? 0,
      }),
      team: { connect: { id: teamId } },
    },
  }).catch((err) => console.error("[AutoOrderImport] Failed to save log:", err));
}

export async function runAutomaticOrderImport(teamId: string): Promise<AutoOrderImportRunResult> {
  const config = getAutoOrderImportConfig();
  const startedAt = new Date();
  const start = Date.now();

  const emptyImportResult: OrderImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    details: [],
  };

  if (!config.enabled) {
    return {
      success: true,
      skipped: true,
      reason: "disabled",
      provider: config.provider,
      fetched: 0,
      normalized: 0,
      importResult: emptyImportResult,
      duration: 0,
    };
  }

  if (isAutoOrderImporting) {
    return {
      success: false,
      skipped: true,
      reason: "already_running",
      provider: config.provider,
      fetched: 0,
      normalized: 0,
      importResult: emptyImportResult,
      duration: 0,
    };
  }

  if (!config.url) {
    const error = "AUTO_ORDER_IMPORT_URL manquant";
    await writeAutoOrderImportLog(teamId, "ERROR", startedAt, {
      provider: config.provider,
      fetched: 0,
      normalized: 0,
      importResult: emptyImportResult,
      duration: Date.now() - start,
    }, error);
    throw new Error(error);
  }

  isAutoOrderImporting = true;

  try {
    const since = await getSinceDate(teamId, config);
    const externalOrders = await fetchConnectedOrders(config, since);
    const normalizedOrders = externalOrders.map((order) => normalizeConnectedOrder(order, config.provider));

    const importResult = await importNormalizedOrders(teamId, normalizedOrders, {
      source: config.provider,
      requireCustomerPhone: config.requireCustomerPhone,
      requireDedupeKey: true,
      updateExisting: true,
    });

    const duration = Date.now() - start;
    const status = importResult.failed > 0 ? (importResult.imported + importResult.updated > 0 ? "PARTIAL" : "ERROR") : "SUCCESS";

    const runResult: AutoOrderImportRunResult = {
      success: status !== "ERROR",
      provider: config.provider,
      fetched: externalOrders.length,
      normalized: normalizedOrders.length,
      importResult,
      duration,
    };

    await writeAutoOrderImportLog(teamId, status, startedAt, runResult);
    lastAutoOrderImportAt = new Date();
    lastAutoOrderImportError = status === "ERROR" ? importResult.errors[0] ?? "Erreur import" : null;

    return runResult;
  } catch (err) {
    const duration = Date.now() - start;
    const errorMessage = err instanceof Error ? err.message : "Erreur import automatique";
    lastAutoOrderImportError = errorMessage;

    await writeAutoOrderImportLog(teamId, "ERROR", startedAt, {
      provider: config.provider,
      fetched: 0,
      normalized: 0,
      importResult: emptyImportResult,
      duration,
    }, errorMessage);

    console.error("[AutoOrderImport] Run error:", err);
    throw err;
  } finally {
    isAutoOrderImporting = false;
  }
}
