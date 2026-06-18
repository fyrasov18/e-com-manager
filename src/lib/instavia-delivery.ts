import { prisma } from "@/lib/prisma";
import { calculateWithholdingTax, getFinanceSettings } from "@/lib/finance";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://app.insta-delivery.com/API";
const FETCH_TIMEOUT_MS = 15_000;

// ─── InstaDelivery Status Map (etat code → platform status) ──────────────────

export const INSTA_STATUS_MAP: Record<string, string> = {
  "1": "CREATED_LABEL",
  "3": "PICKED_UP",
  "4": "HUB_RECEIVED",
  "5": "PLANNED_FOR_DELIVERY",
  "6": "DELIVERY_ISSUE",
  "7": "DELIVERED",
  "23": "DELIVERED_CLOSED",
  "21": "EXCHANGE_CLOSED",
  "16": "EXCHANGE_DELIVERED",
  "22": "RETURN_CLOSED",
  "28": "RETURN_DELIVERED",
  "19": "PICKUP_ISSUE",
};

/** Statuses that indicate a successful delivery (payment expected) */
const DELIVERED_STATES = new Set(["7", "23", "16"]);

/** Statuses that indicate a return has been delivered */
const RETURN_DELIVERED_STATES = new Set(["28"]);

/** Statuses that indicate a pickup / shipped state */
const PICKED_UP_STATES = new Set(["3"]);

/** Statuses that indicate return in progress */
const RETURN_CLOSED_STATES = new Set(["22"]);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InstaDeliveryConfigDB {
  id: string;
  name: string;
  carrier: string;
  deliveryType: string;
  trackingEnabled: boolean;
  webhookEnabled: boolean;
  labelCreationEnabled: boolean;
  login: string;
  password: string;
  isActive: boolean;
  lastTested: Date | null;
  lastError: string | null;
  teamId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstaColisData {
  nom_destinataire: string;
  adresse_destinataire: string;
  tel_destinataire: string;
  cheque: string | null;
  facture: string;
  payement_mode: string;
  created_at: string;
  designation: string;
  etat: string;
  last_operation_date: string;
  code_barre: string;
  id: string;
  reference: string;
  montant_reception: string;
  id_fournisseur: string;
  etat_str: string;
}

export interface InstaTrackingResult {
  success: boolean;
  colis: InstaColisData | null;
  error?: string;
}

export interface InstaCreateParcelPayload {
  reference: string;
  designation: string;
  montant_reception: string;
  modalite: "0" | "2" | "3";
  contenuEchange?: string;
  code: string;
  tel: string;
  adresse: string;
  nom: string;
  nombre_piece: number;
  open_parcel?: number;
  fragile?: number;
}

export interface InstaCreateParcelResult {
  success: boolean;
  code_barre?: string;
  pck_code?: string;
  barcode_out?: string;
  error?: string;
}

export interface InstaDeleteResult {
  success: boolean;
  message: string;
}

export interface InstaSyncResult {
  imported: number;
  updated: number;
  ignored: number;
  errors: string[];
}

// ─── Utility: parseMoney ──────────────────────────────────────────────────────

/**
 * Robust money parser that handles various formats:
 * "20", "20.000", "20,000", "20 TND", numbers, strings with spaces
 * Returns null if the value is absent/unparseable.
 * Returns 0 ONLY if the API explicitly returns "0".
 */
export function parseMoney(value: unknown): number | null {
  if (value === undefined || value === null) return null;

  if (typeof value === "number") {
    return isFinite(value) ? value : null;
  }

  if (typeof value !== "string") return null;

  // Remove currency suffixes, whitespace
  let cleaned = value.trim();
  if (!cleaned) return null;

  // Remove common currency suffixes
  cleaned = cleaned
    .replace(/\s*(TND|DT|EUR|USD|€|\$)\s*/gi, "")
    .trim();

  if (!cleaned) return null;

  // Handle comma as decimal separator (e.g., "20,500" → "20.500")
  // But also handle "1,000.50" format
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Both comma and dot: assume comma is thousands separator
    cleaned = cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    // Only comma: could be decimal separator
    // If there's exactly 3 digits after comma, it's likely thousands separator in "20,000" format
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length === 3) {
      // "20,000" → likely 20000, but in Tunisian context "20,000" is "20.000" = 20
      // API uses "20.000" format where . is thousands separator
      // We'll treat comma same as dot-thousands
      cleaned = cleaned.replace(/,/g, "");
    } else {
      // "20,5" → 20.5 (decimal)
      cleaned = cleaned.replace(",", ".");
    }
  }

  // Handle dot as thousands separator (e.g., "20.000" = 20000 in some locales)
  // In the InstaDelivery context, "20.000" means 20 TND (with .000 = subunits)
  // Keep as-is since parseFloat handles "20.000" → 20

  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  return num;
}

// ─── Config Management ────────────────────────────────────────────────────────

export async function getInstaDeliveryConfigs(teamId: string): Promise<InstaDeliveryConfigDB[]> {
  const configs = await prisma.instaDeliveryConfig.findMany({
    where: { teamId },
    orderBy: { createdAt: "asc" },
  });
  return configs as InstaDeliveryConfigDB[];
}

export async function getInstaDeliveryConfigById(configId: string): Promise<InstaDeliveryConfigDB | null> {
  const config = await prisma.instaDeliveryConfig.findUnique({
    where: { id: configId },
  });
  if (!config || !config.isActive) return null;
  return config as InstaDeliveryConfigDB;
}

export async function getInstaDeliveryConfigByCarrier(teamId: string, carrier: string): Promise<InstaDeliveryConfigDB | null> {
  const config = await prisma.instaDeliveryConfig.findFirst({
    where: { teamId, carrier, isActive: true },
  });
  return config as InstaDeliveryConfigDB | null;
}

// Backward-compatible: get first active config for a team
export async function getInstaDeliveryConfig(teamId: string): Promise<InstaDeliveryConfigDB | null> {
  const config = await prisma.instaDeliveryConfig.findFirst({
    where: { teamId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return config as InstaDeliveryConfigDB | null;
}

export async function saveInstaDeliveryConfig(
  teamId: string,
  login: string,
  password: string,
  name: string = "Default",
  carrier: string = "INSTADELIVERY",
  deliveryType: string = "standard",
  trackingEnabled: boolean = true,
  webhookEnabled: boolean = true,
  labelCreationEnabled: boolean = true
): Promise<{ success: boolean; message: string; configId?: string }> {
  try {
    const existing = await prisma.instaDeliveryConfig.findFirst({
      where: { teamId, name },
    });

    if (existing) {
      await prisma.instaDeliveryConfig.update({
        where: { id: existing.id },
        data: { login, password, isActive: true, carrier, deliveryType, trackingEnabled, webhookEnabled, labelCreationEnabled },
      });
      return { success: true, message: "Configuration mise à jour.", configId: existing.id };
    }

    const config = await prisma.instaDeliveryConfig.create({
      data: {
        teamId, login, password, name, carrier, deliveryType,
        trackingEnabled, webhookEnabled, labelCreationEnabled, isActive: true,
      },
    });
    return { success: true, message: "Configuration enregistrée.", configId: config.id };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Erreur lors de l'enregistrement",
    };
  }
}

export async function deleteInstaDeliveryConfig(configId: string): Promise<{ success: boolean; message: string }> {
  try {
    await prisma.instaDeliveryConfig.delete({ where: { id: configId } });
    return { success: true, message: "Configuration InstaDelivery supprimée." };
  } catch {
    return { success: false, message: "Erreur lors de la suppression." };
  }
}

export async function testInstaDeliveryConnection(
  configId: string
): Promise<{ success: boolean; message: string }> {
  const config = await getInstaDeliveryConfigById(configId);
  if (!config) {
    return { success: false, message: "Configuration InstaDelivery non trouvée." };
  }

  try {
    const res = await safeFetch(`${BASE_URL}/state_list`, { method: "GET" });

    if (!res.ok) {
      const errorMsg = `Erreur API: ${res.status}`;
      await prisma.instaDeliveryConfig.update({
        where: { id: configId },
        data: { lastTested: new Date(), lastError: errorMsg },
      });
      return { success: false, message: errorMsg };
    }

    await prisma.instaDeliveryConfig.update({
      where: { id: configId },
      data: { lastTested: new Date(), lastError: null },
    });

    return { success: true, message: "Connexion InstaDelivery réussie!" };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Erreur réseau";
    await prisma.instaDeliveryConfig.update({
      where: { id: configId },
      data: { lastTested: new Date(), lastError: errorMsg },
    });
    return { success: false, message: errorMsg };
  }
}

// ─── Safe Fetch (with timeout & JSON error handling) ──────────────────────────

async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeJsonParse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    console.error("[InstaDelivery] Invalid JSON response:", text.slice(0, 300));
    return null;
  }
}

export function buildInstaDeliveryTrackingUrl(config: Pick<InstaDeliveryConfigDB, "login" | "password">, codeBarre: string): string {
  const login = encodeURIComponent(config.login);
  const password = encodeURIComponent(config.password);
  const barcode = encodeURIComponent(codeBarre.trim());
  return `${BASE_URL}/tracking/${login}/${password}/${barcode}`;
}

// ─── API: Create Parcel ─────────────────────────────────────────────────────

export async function createInstaDeliveryParcel(
  configId: string,
  payload: InstaCreateParcelPayload
): Promise<InstaCreateParcelResult> {
  const config = await getInstaDeliveryConfigById(configId);
  if (!config) {
    return { success: false, error: "InstaDelivery non configuré" };
  }

  // Validation
  const missing: string[] = [];
  if (!payload.reference?.trim()) missing.push("reference");
  if (!payload.designation?.trim()) missing.push("designation");
  if (!payload.montant_reception?.trim()) missing.push("montant_reception");
  if (!payload.code?.trim()) missing.push("code");
  if (!payload.tel?.trim()) missing.push("tel");
  if (!payload.adresse?.trim()) missing.push("adresse");
  if (!payload.nom?.trim()) missing.push("nom");
  if (missing.length > 0) {
    return { success: false, error: `Champs requis manquants: ${missing.join(", ")}` };
  }

  try {
    const res = await safeFetch(`${BASE_URL}/add`, {
      method: "POST",
      body: JSON.stringify({
        login: config.login,
        password: config.password,
        reference: payload.reference,
        designation: payload.designation,
        montant_reception: payload.montant_reception,
        modalite: payload.modalite || "0",
        contenuEchange: payload.contenuEchange || "",
        code: payload.code,
        tel: payload.tel,
        adresse: payload.adresse,
        nom: payload.nom,
        nombre_piece: payload.nombre_piece || 1,
        open_parcel: payload.open_parcel || 0,
        fragile: payload.fragile || 0,
      }),
    });

    const data = await safeJsonParse(res);

    if (!data) {
      return { success: false, error: "Réponse API vide ou invalide" };
    }

    // API returns: { code_barre, pck_code, barcode_out }
    if (data.code_barre || data.pck_code) {
      return {
        success: true,
        code_barre: data.code_barre || data.pck_code,
        pck_code: data.pck_code,
        barcode_out: data.barcode_out || "",
      };
    }

    return { success: false, error: data.message || "Échec création colis" };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur réseau",
    };
  }
}

// ─── API: Track Parcel ──────────────────────────────────────────────────────

export async function trackInstaDeliveryParcel(
  codeBarre: string,
  configId?: string
): Promise<InstaTrackingResult> {
  if (!codeBarre?.trim()) {
    return { success: false, colis: null, error: "Code barre requis" };
  }

  try {
    if (!configId) {
      return { success: false, colis: null, error: "Configuration InstaDelivery requise" };
    }

    const config = await getInstaDeliveryConfigById(configId);
    if (!config) {
      return { success: false, colis: null, error: "InstaDelivery non configuré" };
    }

    const url = buildInstaDeliveryTrackingUrl(config, codeBarre);
    const res = await safeFetch(url, { method: "GET" });

    if (!res.ok) {
      if (res.status === 404) return { success: false, colis: null, error: "Colis non trouvé" };
      return { success: false, colis: null, error: `Erreur API: ${res.status}` };
    }

    const data = await safeJsonParse(res);

    if (!data) {
      return { success: false, colis: null, error: "Réponse API InstaDelivery vide ou invalide" };
    }

    if (typeof data.error === "string" && data.error.trim()) {
      return { success: false, colis: null, error: data.error };
    }

    // L'API peut retourner { success: false, message: "..." } si le colis n'existe pas
    if (data.success === false || data.success === 0) {
      return { success: false, colis: null, error: data.message || "Colis non trouvé" };
    }

    // API returns: { colis: { ... } }, an array, or just the colis object.
    const colis = data.colis || (Array.isArray(data) ? data[0] : data);

    if (!colis || (!colis.code_barre && !colis.id && !colis.pck_code)) {
      return { success: false, colis: null, error: "Colis non trouvé ou données incomplètes" };
    }

    return {
      success: true,
      colis: {
        nom_destinataire: colis.nom_destinataire || "",
        adresse_destinataire: colis.adresse_destinataire || "",
        tel_destinataire: colis.tel_destinataire || "",
        cheque: colis.cheque ?? null,
        facture: String(colis.facture ?? "0"),
        payement_mode: String(colis.payement_mode ?? ""),
        created_at: colis.created_at || "",
        designation: colis.designation || "",
        etat: String(colis.etat ?? ""),
        last_operation_date: colis.last_operation_date || "",
        code_barre: colis.code_barre || codeBarre,
        id: String(colis.id ?? ""),
        reference: colis.reference || "",
        montant_reception: String(colis.montant_reception ?? ""),
        id_fournisseur: String(colis.id_fournisseur ?? ""),
        etat_str: colis.etat_str || INSTA_STATUS_MAP[String(colis.etat)] || "Inconnu",
      },
    };
  } catch (err) {
    return {
      success: false,
      colis: null,
      error: err instanceof Error ? err.message : "Erreur réseau",
    };
  }
}

// ─── API: Delete Parcel ──────────────────────────────────────────────────────

export async function deleteInstaDeliveryParcel(
  configId: string,
  barcode: string
): Promise<InstaDeleteResult> {
  const config = await getInstaDeliveryConfigById(configId);
  if (!config) {
    return { success: false, message: "InstaDelivery non configuré" };
  }

  try {
    const res = await safeFetch(`${BASE_URL}/deletecolis`, {
      method: "POST",
      body: JSON.stringify({
        login: config.login,
        password: config.password,
        barcode,
      }),
    });

    const data = await safeJsonParse(res);

    if (!data) {
      return { success: false, message: "Réponse API vide" };
    }

    return {
      success: data.success === 1 || data.success === true,
      message: data.message || (data.success ? "Colis supprimé" : "Impossible de supprimer"),
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Erreur réseau",
    };
  }
}

// ─── API: State List ────────────────────────────────────────────────────────

export async function getInstaDeliveryStateList(): Promise<Record<string, string>> {
  try {
    const res = await safeFetch(`${BASE_URL}/state_list`, { method: "GET" });
    if (!res.ok) return {};
    const data = await safeJsonParse(res);
    return data || {};
  } catch {
    return {};
  }
}

// ─── API: Modalite List ──────────────────────────────────────────────────────

export async function getInstaDeliveryModaliteList(): Promise<Record<string, string>> {
  try {
    const res = await safeFetch(`${BASE_URL}/modalite_liste`, { method: "GET" });
    if (!res.ok) return {};
    const data = await safeJsonParse(res);
    return data || {};
  } catch {
    return {};
  }
}

// ─── API: Postal Codes ──────────────────────────────────────────────────────

export async function getInstaDeliveryPostalCodes(): Promise<any> {
  try {
    const res = await safeFetch(`${BASE_URL}/code_postal`, { method: "GET" });
    if (!res.ok) return [];
    const data = await safeJsonParse(res);
    return data || [];
  } catch {
    return [];
  }
}

// ─── Payment Detection Logic ────────────────────────────────────────────────

/**
 * Determines if a tracked colis should generate a payment/revenue entry.
 * Payment is detected when:
 *   - montant_reception > 0
 *   - AND etat indicates delivered/closed
 */
export function isDeliveredForPayment(etat: string): boolean {
  return DELIVERED_STATES.has(etat);
}

export function isReturnDelivered(etat: string): boolean {
  return RETURN_DELIVERED_STATES.has(etat);
}

export function detectPaymentFromColis(colis: InstaColisData): {
  hasPayment: boolean;
  amount: number | null;
  paymentStatus: "RECEIVED" | "PENDING" | "RETURN";
} {
  const amount = parseMoney(colis.montant_reception);
  const etat = colis.etat;

  if (isReturnDelivered(etat)) {
    return { hasPayment: false, amount, paymentStatus: "RETURN" };
  }

  if (isDeliveredForPayment(etat) && amount !== null && amount > 0) {
    return { hasPayment: true, amount, paymentStatus: "RECEIVED" };
  }

  return { hasPayment: false, amount, paymentStatus: "PENDING" };
}

// ─── Stock Status Mapping ───────────────────────────────────────────────────

/**
 * Maps InstaDelivery etat to stock movement type.
 * - "3" (Colis enlevé) → OUT (stock decrease)
 * - "28" (Retour Livré) → IN (stock return)
 * - "22" (Clôture pour retour) → PENDING (return in transit)
 * - Other states: no stock movement
 */
export function getStockMovementForEtat(etat: string): {
  type: "IN" | "OUT" | "PENDING" | null;
  note: string;
} {
  if (PICKED_UP_STATES.has(etat)) {
    return { type: "OUT", note: "Sortie stock — Colis enlevé (InstaDelivery)" };
  }
  if (RETURN_DELIVERED_STATES.has(etat)) {
    return { type: "IN", note: "Retour stock — Retour livré (InstaDelivery)" };
  }
  if (RETURN_CLOSED_STATES.has(etat)) {
    return { type: "PENDING", note: "Stock en attente — Retour planifié (InstaDelivery)" };
  }
  return { type: null, note: "" };
}

// ─── Sync Single Tracking → Order + DeliveryRevenue ─────────────────────────

export async function syncInstaDeliveryTracking(
  configId: string,
  codeBarre: string
): Promise<{
  success: boolean;
  action: "created" | "updated" | "ignored" | "error";
  message: string;
  colis?: InstaColisData;
}> {
  const config = await getInstaDeliveryConfigById(configId);
  if (!config) {
    return {
      success: false,
      action: "error",
      message: "Configuration non trouvée",
    };
  }

  const trackResult = await trackInstaDeliveryParcel(codeBarre, configId);

  if (!trackResult.success || !trackResult.colis) {
    return {
      success: false,
      action: "error",
      message: trackResult.error || `Tracking échoué pour ${codeBarre}`,
    };
  }

  const colis = trackResult.colis;
  const amount = parseMoney(colis.montant_reception);
  const { paymentStatus } = detectPaymentFromColis(colis);
  const mappedStatus = INSTA_STATUS_MAP[colis.etat] || colis.etat_str;

  const teamId = config.teamId;

  // ── Parse dates from API ────────────────────────────────────────────────────
  let operationDate: Date | null = null;
  if (colis.last_operation_date) {
    const parsed = new Date(colis.last_operation_date);
    if (!isNaN(parsed.getTime())) operationDate = parsed;
  }

  let createdAt: Date | null = null;
  if (colis.created_at) {
    const parsed = new Date(colis.created_at);
    if (!isNaN(parsed.getTime())) createdAt = parsed;
  }

  // deliveredAt = last_operation_date when status is DELIVERED
  const isDelivered = DELIVERED_STATES.has(colis.etat);
  const isPickedUp = PICKED_UP_STATES.has(colis.etat);
  const deliveredAt = isDelivered && operationDate ? operationDate : null;
  const pickedUpAt = isPickedUp && operationDate ? operationDate : null;

  const reference = colis.reference || colis.code_barre;
  const financeSettings = await getFinanceSettings(teamId, "INSTADELIVERY");
  const withholdingTaxApplied = calculateWithholdingTax(
    amount ?? 0,
    financeSettings.withholdingTaxPercent
  );
  const validatedRevenue = amount ?? 0;
  const netProfit = Math.max(0, validatedRevenue - withholdingTaxApplied);

  try {
    // ── 1. Upsert the Order record ───────────────────────────────────────────
    const existingOrder = await prisma.order.findFirst({
      where: {
        teamId,
        OR: [
          { trackingNumber: colis.code_barre },
          ...(colis.reference ? [{ reference: colis.reference }] : []),
        ],
      },
    });

    let orderAction: "created" | "updated" | "ignored" = "ignored";

    if (existingOrder) {
      // Update existing order with fresh API data
      await prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          apiStatus: colis.etat_str,
          status: mappedStatus || existingOrder.status,
          // Customer info — only fill if empty
          ...(colis.nom_destinataire && !existingOrder.customerName
            ? { customerName: colis.nom_destinataire }
            : {}),
          ...(colis.tel_destinataire && !existingOrder.customerPhone
            ? { customerPhone: colis.tel_destinataire }
            : {}),
          ...(colis.adresse_destinataire && !existingOrder.shippingAddress
            ? { shippingAddress: colis.adresse_destinataire }
            : {}),
          // Financial data
          ...(amount !== null && amount > 0 ? { revenue: amount } : {}),
          validatedRevenue,
          withholdingTaxApplied,
          netProfit,
          // Dates from API
          operationDate: operationDate ?? existingOrder.operationDate,
          ...(deliveredAt ? { deliveredAt } : {}),
          ...(pickedUpAt ? { pickedUpAt } : {}),
          // Payment reference
          ...(colis.payement_mode && !existingOrder.paymentNumber
            ? { paymentNumber: colis.payement_mode }
            : {}),
          // Tracking & reference
          trackingNumber: colis.code_barre || existingOrder.trackingNumber,
          reference: colis.reference || existingOrder.reference,
          shippingProvider: "INSTADELIVERY",
        },
      });
      orderAction = "updated";
    } else {
      // Create new order from API data
      await prisma.order.create({
        data: {
          teamId,
          shippingProvider: "INSTADELIVERY",
          trackingNumber: colis.code_barre,
          reference: colis.reference || colis.code_barre,
          status: mappedStatus || "UNKNOWN",
          apiStatus: colis.etat_str,
          customerName: colis.nom_destinataire || null,
          customerPhone: colis.tel_destinataire || null,
          shippingAddress: colis.adresse_destinataire || null,
          revenue: amount ?? 0,
          cost: 0,
          profit: 0,
          validatedRevenue,
          withholdingTaxApplied,
          netProfit,
          operationDate: operationDate ?? undefined,
          deliveredAt: deliveredAt ?? undefined,
          pickedUpAt: pickedUpAt ?? undefined,
          paymentNumber: colis.payement_mode || null,
          date: createdAt ?? new Date(),
          importedAt: new Date(),
        },
      });
      orderAction = "created";
    }

    // ── 2. Upsert DeliveryRevenue record ────────────────────────────────────
    const existingRevenue = await prisma.deliveryRevenue.findFirst({
      where: {
        teamId,
        provider: "INSTADELIVERY",
        OR: [
          { trackingNumber: colis.code_barre },
          { reference: reference },
        ],
      },
    });

    const revenueData = {
      provider: "INSTADELIVERY" as const,
      source: "API_SYNC",
      trackingNumber: colis.code_barre,
      reference,
      customerName: colis.nom_destinataire || null,
      amount: amount ?? 0,
      deliveryFee: 0,
      returnFee: 0,
      withholdingTaxApplied,
      netAmount: Math.max(0, (amount ?? 0) - withholdingTaxApplied),
      apiStatus: colis.etat_str,
      paymentNumber: colis.payement_mode || null,
      paymentDate: operationDate,
      paymentStatus,
      isValidated: false,
      confidenceScore: null,
      rawData: colis as any,
      pdfFileName: null,
    };

    if (existingRevenue) {
      const updateData: Record<string, any> = {
        apiStatus: colis.etat_str,
        paymentStatus: existingRevenue.isValidated ? "VALIDATED" : paymentStatus,
        rawData: colis as any,
      };
      const effectiveAmount = amount !== null && amount > 0 ? amount : existingRevenue.amount || 0;
      const effectiveWithholdingTax = calculateWithholdingTax(
        effectiveAmount,
        financeSettings.withholdingTaxPercent
      );
      updateData.withholdingTaxApplied = effectiveWithholdingTax;
      updateData.netAmount = Math.max(0, effectiveAmount - effectiveWithholdingTax);

      if (amount !== null && amount > 0 && (existingRevenue.amount === 0 || existingRevenue.amount === null)) {
        updateData.amount = amount;
      }
      if (colis.nom_destinataire && !existingRevenue.customerName) {
        updateData.customerName = colis.nom_destinataire;
      }
      if (colis.code_barre && !existingRevenue.trackingNumber) {
        updateData.trackingNumber = colis.code_barre;
      }
      if (operationDate) {
        updateData.paymentDate = operationDate;
      }
      if (colis.payement_mode && !existingRevenue.paymentNumber) {
        updateData.paymentNumber = colis.payement_mode;
      }

      await prisma.deliveryRevenue.update({
        where: { id: existingRevenue.id },
        data: updateData,
      });
    } else {
      await prisma.deliveryRevenue.create({
        data: {
          ...revenueData,
          team: { connect: { id: teamId } },
          importedAt: new Date(),
        },
      });
    }

    return {
      success: true,
      action: orderAction,
      message: `[Order:${orderAction}] ${colis.code_barre} — ${colis.etat_str} — ${amount ?? 0} TND — opDate:${operationDate?.toISOString() ?? "N/A"}`,
      colis,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur base de données";
    console.error("[InstaDelivery] Sync tracking DB error:", msg);
    return { success: false, action: "error", message: msg };
  }
}

// ─── Bulk Sync: Multiple Tracking Numbers ───────────────────────────────────

export async function syncInstaDeliveryPayments(
  teamId: string,
  codeBarres: string[]
): Promise<InstaSyncResult> {
  const result: InstaSyncResult = {
    imported: 0,
    updated: 0,
    ignored: 0,
    errors: [],
  };

  // Retrieve the active config for this team
  const config = await getInstaDeliveryConfig(teamId);
  if (!config) {
    result.errors.push("Aucune configuration InstaDelivery active trouvée");
    return result;
  }

  for (const codeBarre of codeBarres) {
    const trimmed = codeBarre.trim();
    if (!trimmed) {
      result.ignored++;
      continue;
    }

    try {
      // Pass the real configId so credentials are used for tracking
      const syncResult = await syncInstaDeliveryTracking(config.id, trimmed);

      if (syncResult.action === "created") {
        result.imported++;
      } else if (syncResult.action === "updated") {
        result.updated++;
      } else if (syncResult.action === "ignored") {
        result.ignored++;
      } else {
        result.errors.push(syncResult.message);
      }

      // Stock sync if colis data available
      if (syncResult.colis) {
        await syncStockFromInstaDelivery(teamId, syncResult.colis);
      }
    } catch (err) {
      result.errors.push(`${trimmed}: ${err instanceof Error ? err.message : "Erreur"}`);
    }
  }

  return result;
}

// ─── Sync All Existing InstaDelivery Tracking Numbers ───────────────────────

export async function syncAllInstaDeliveryRevenue(teamId: string): Promise<InstaSyncResult> {
  // Fetch all orders with InstaDelivery tracking
  const orders = await prisma.order.findMany({
    where: {
      teamId,
      shippingProvider: { in: ["INSTAVIA_DELIVERY", "INSTADELIVERY"] },
      trackingNumber: { not: null },
    },
    select: { trackingNumber: true },
  });

  // Also get existing delivery revenues with InstaDelivery
  const existingRevenues = await prisma.deliveryRevenue.findMany({
    where: {
      teamId,
      provider: "INSTADELIVERY",
      trackingNumber: { not: null },
    },
    select: { trackingNumber: true },
  });

  // Merge all unique tracking numbers
  const allTrackingNumbers = new Set<string>();
  for (const o of orders) {
    if (o.trackingNumber) allTrackingNumbers.add(o.trackingNumber);
  }
  for (const r of existingRevenues) {
    if (r.trackingNumber) allTrackingNumbers.add(r.trackingNumber);
  }

  if (allTrackingNumbers.size === 0) {
    return { imported: 0, updated: 0, ignored: 0, errors: ["Aucun tracking InstaDelivery trouvé"] };
  }

  return syncInstaDeliveryPayments(teamId, Array.from(allTrackingNumbers));
}

// ─── Stock Sync from InstaDelivery Tracking ─────────────────────────────────

async function syncStockFromInstaDelivery(teamId: string, colis: InstaColisData) {
  const { type, note } = getStockMovementForEtat(colis.etat);
  if (!type) return;

  // Find the order by tracking number
  const order = await prisma.order.findFirst({
    where: {
      teamId,
      trackingNumber: colis.code_barre,
    },
    include: { product: true },
  });

  if (!order || !order.productId || !order.product) return;

  const quantity = order.quantity || 1;

  // Check for existing movement to prevent duplicates
  const existingMovement = await prisma.stockMovement.findFirst({
    where: {
      orderId: order.id,
      type,
      status: "COMPLETED",
    },
  });

  if (existingMovement) {
    console.log(`[InstaDelivery] Stock movement already exists for order ${order.id}, type ${type}`);
    return;
  }

  // Apply stock change
  const product = order.product;
  if (type === "OUT") {
    const newStock = product.stockQuantity - quantity;
    if (newStock < 0) {
      console.warn(`[InstaDelivery] Stock insuffisant for product ${product.id}`);
      return;
    }
    await prisma.product.update({
      where: { id: product.id },
      data: { stockQuantity: newStock },
    });
  } else if (type === "IN") {
    await prisma.product.update({
      where: { id: product.id },
      data: { stockQuantity: product.stockQuantity + quantity },
    });
  } else if (type === "PENDING") {
    await prisma.product.update({
      where: { id: product.id },
      data: { stockEnAttente: product.stockEnAttente + quantity },
    });
  }

  await prisma.stockMovement.create({
    data: {
      productId: product.id,
      quantity,
      type,
      status: type === "PENDING" ? "PENDING" : "COMPLETED",
      orderId: order.id,
      source: "ORDER",
    },
  });

  console.log(`[InstaDelivery] Stock ${type} ${quantity} for product ${product.id} — ${note}`);
}

export interface InstaPayment {
  reference: string;
  tracking_number?: string;
  amount?: string;
  status?: string;
  date?: string;
  montant?: string;
  numero_suivi?: string;
}

/**
 * NOTE: InstaDelivery has NO /paiements endpoint in their API.
 * Payment data must be obtained by tracking individual parcels via /API/tracking/{barcode}.
 * This function is kept for backward compatibility but will always return empty results.
 */
export async function getPayments(_configId?: string): Promise<{ payments: InstaPayment[]; message?: string }> {
  return {
    payments: [],
    message: "L'endpoint /paiements n'existe pas dans l'API InstaDelivery. Utilisez l'import par tracking numbers pour synchroniser les paiements.",
  };
}
