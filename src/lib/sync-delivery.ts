/**
 * syncDeliveryCompanies — Central sync function
 * Called by cron route and manual sync buttons.
 * Anti-lock: prevents concurrent runs via module-level flag.
 */
import { prisma } from "@/lib/prisma";
import { getColissimoConfig, listColis, getColisDetails } from "./colissimo";
import {
  getInstaDeliveryConfig,
  syncInstaDeliveryTracking,
  syncAllInstaDeliveryRevenue,
} from "./instavia-delivery";

// ── Module-level sync lock ───────────────────────────────────────────
let isSyncing = false;
let lastSyncAt: Date | null = null;
let lastSyncError: string | null = null;

export function getSyncStatus() {
  return { isSyncing, lastSyncAt, lastSyncError };
}

export interface SyncProviderResult {
  provider: string;
  ordersCreated: number;
  ordersUpdated: number;
  paymentsCreated: number;
  paymentsUpdated: number;
  errorsCount: number;
  errorMessage?: string;
}

export interface SyncAllResult {
  success: boolean;
  providers: SyncProviderResult[];
  totalOrders: number;
  totalPayments: number;
  duration: number;
}

// ── Main entry ───────────────────────────────────────────────────────
export async function syncDeliveryCompanies(teamId: string): Promise<SyncAllResult> {
  if (isSyncing) {
    return {
      success: false,
      providers: [],
      totalOrders: 0,
      totalPayments: 0,
      duration: 0,
    };
  }

  isSyncing = true;
  const start = Date.now();
  const results: SyncProviderResult[] = [];

  try {
    // Run providers independently — one failure does NOT block the other
    const [colResult, instaResult] = await Promise.allSettled([
      syncColissimo(teamId),
      syncInstaDelivery(teamId),
    ]);

    if (colResult.status === "fulfilled") {
      results.push(colResult.value);
    } else {
      results.push({
        provider: "COLISSIMO",
        ordersCreated: 0, ordersUpdated: 0,
        paymentsCreated: 0, paymentsUpdated: 0,
        errorsCount: 1,
        errorMessage: colResult.reason?.message ?? "Erreur inconnue",
      });
    }

    if (instaResult.status === "fulfilled") {
      results.push(instaResult.value);
    } else {
      results.push({
        provider: "INSTADELIVERY",
        ordersCreated: 0, ordersUpdated: 0,
        paymentsCreated: 0, paymentsUpdated: 0,
        errorsCount: 1,
        errorMessage: instaResult.reason?.message ?? "Erreur inconnue",
      });
    }

    lastSyncAt = new Date();
    lastSyncError = null;

    // Persist logs
    for (const r of results) {
      await prisma.deliverySyncLog.create({
        data: {
          provider: r.provider,
          status: r.errorsCount > 0 ? (r.ordersCreated + r.ordersUpdated > 0 ? "PARTIAL" : "ERROR") : "SUCCESS",
          finishedAt: new Date(),
          ordersCreated: r.ordersCreated,
          ordersUpdated: r.ordersUpdated,
          paymentsCreated: r.paymentsCreated,
          paymentsUpdated: r.paymentsUpdated,
          errorsCount: r.errorsCount,
          errorMessage: r.errorMessage ?? null,
          rawSummary: JSON.stringify(r),
          team: { connect: { id: teamId } },
        },
      }).catch(e => console.error("[SyncLog] Failed to save log:", e));
    }

    const totalOrders = results.reduce((s, r) => s + r.ordersCreated + r.ordersUpdated, 0);
    const totalPayments = results.reduce((s, r) => s + r.paymentsCreated + r.paymentsUpdated, 0);

    return { success: true, providers: results, totalOrders, totalPayments, duration: Date.now() - start };
  } catch (err) {
    lastSyncError = err instanceof Error ? err.message : "Erreur sync";
    throw err;
  } finally {
    isSyncing = false;
  }
}

// ── Colissimo sync ────────────────────────────────────────────────────
async function syncColissimo(teamId: string): Promise<SyncProviderResult> {
  const result: SyncProviderResult = {
    provider: "COLISSIMO",
    ordersCreated: 0, ordersUpdated: 0,
    paymentsCreated: 0, paymentsUpdated: 0,
    errorsCount: 0,
  };

  const config = await getColissimoConfig(teamId);
  if (!config) return result; // Not configured — skip silently

  // Get all tracked Colissimo orders from DB
  const existingOrders = await prisma.order.findMany({
    where: {
      teamId,
      trackingNumber: { not: null },
      shippingProvider: { contains: "COLISSIMO", mode: "insensitive" },
    },
    select: { id: true, trackingNumber: true },
  });

  if (existingOrders.length === 0) return result;

  const codeBars = Array.from(new Set(
    existingOrders
      .map(o => o.trackingNumber?.trim())
      .filter((code): code is string => Boolean(code))
  ));

  // Process in batches of 50 (API v2 limit)
  const BATCH = 50;
  for (let i = 0; i < codeBars.length; i += BATCH) {
    const batch = codeBars.slice(i, i + BATCH);
    try {
      const bulkResult = await listColis(teamId, batch);
      const { colis, errors } = bulkResult.success && bulkResult.colis.length > 0
        ? bulkResult
        : batch.length === 1
          ? await (async () => {
              const r = await getColisDetails(teamId, batch[0]);
              return r.success && r.details
                ? { success: true, colis: [r.details], errors: [] }
                : { success: false, colis: [], errors: [r.error ?? bulkResult.errors[0] ?? "Erreur API"] };
            })()
          : bulkResult;

      for (const c of colis) {
        try {
          const r = await upsertColissimoOrder(teamId, c);
          if (r.action === "created") { result.ordersCreated++; result.paymentsCreated += r.paymentCreated ? 1 : 0; }
          else { result.ordersUpdated++; result.paymentsUpdated += r.paymentUpdated ? 1 : 0; }
        } catch (e) {
          result.errorsCount++;
          console.error("[Sync/Colissimo] upsert error:", e);
        }
      }
      result.errorsCount += errors.length;
    } catch (e) {
      result.errorsCount++;
      console.error("[Sync/Colissimo] batch error:", e);
    }
  }

  // Update lastSyncAt
  await prisma.colissimoIntegration.update({
    where: { teamId },
    data: { lastSyncAt: new Date() },
  }).catch(() => {});

  return result;
}

async function upsertColissimoOrder(teamId: string, colis: any) {
  const isPaymentReceived =
    !!colis.numPaiement ||
    colis.mappedStatus === "PAID_DELIVERED" ||
    String(colis.etat ?? "").toLowerCase().includes("payé");

  const paymentStatus = isPaymentReceived ? "RECEIVED" : "PENDING";

  const { getFinanceSettings, calculateOrderFinance } = await import("@/lib/finance");
  const settings = await getFinanceSettings(teamId, "COLISSIMO");
  const finance = calculateOrderFinance({
    totalAmount: colis.prix || 0,
    status: colis.mappedStatus,
    settings
  });

  const existing = await prisma.order.findFirst({
    where: {
      teamId,
      OR: [
        ...(colis.codeBar ? [{ trackingNumber: colis.codeBar }] : []),
        ...(colis.reference ? [{ reference: colis.reference }] : []),
      ],
    },
  });

  let orderId: string;
  let action: "created" | "updated";

  if (existing) {
    await prisma.order.update({
      where: { id: existing.id },
      data: {
        status: colis.mappedStatus || existing.status,
        apiStatus: colis.etat || existing.apiStatus,
        customerName: colis.client || existing.customerName,
        customerPhone: colis.tel1 || existing.customerPhone,
        shippingAddress: colis.adresse || existing.shippingAddress,
        shippingCity: colis.ville || existing.shippingCity,
        revenue: colis.prix > 0 ? colis.prix : existing.revenue, // legacy field
        validatedRevenue: finance.validatedRevenue,
        deliveryCostApplied: finance.deliveryCostApplied,
        returnCostApplied: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netProfit: finance.netProfit,
        paymentNumber: colis.numPaiement || existing.paymentNumber,
        deliveredAt: colis.dateLivraison ? new Date(colis.dateLivraison) : existing.deliveredAt,
        pickedUpAt: colis.dateEnlevement ? new Date(colis.dateEnlevement) : existing.pickedUpAt,
        shippingProvider: "COLISSIMO",
      },
    });
    orderId = existing.id;
    action = "updated";
  } else {
    const newOrder = await prisma.order.create({
      data: {
        teamId, status: colis.mappedStatus || "UNKNOWN",
        revenue: colis.prix || 0, cost: 0, profit: 0,
        validatedRevenue: finance.validatedRevenue,
        deliveryCostApplied: finance.deliveryCostApplied,
        returnCostApplied: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netProfit: finance.netProfit,
        shippingProvider: "COLISSIMO",
        trackingNumber: colis.codeBar,
        reference: colis.reference,
        customerName: colis.client,
        customerPhone: colis.tel1,
        shippingAddress: colis.adresse,
        shippingCity: colis.ville,
        shippingZip: colis.gouvernorat,
        apiStatus: colis.etat,
        paymentNumber: colis.numPaiement,
        deliveredAt: colis.dateLivraison ? new Date(colis.dateLivraison) : undefined,
        pickedUpAt: colis.dateEnlevement ? new Date(colis.dateEnlevement) : undefined,
      },
    });
    orderId = newOrder.id;
    action = "created";
  }

  // Upsert revenue
  let paymentCreated = false, paymentUpdated = false;
  const existingRev = await prisma.deliveryRevenue.findFirst({
    where: {
      teamId, provider: "COLISSIMO",
      OR: [
        colis.codeBar ? { trackingNumber: colis.codeBar } : undefined,
        colis.numPaiement ? { paymentNumber: colis.numPaiement } : undefined,
      ].filter(Boolean) as any[],
    },
  });

  if (existingRev) {
    await prisma.deliveryRevenue.update({
      where: { id: existingRev.id },
      data: {
        orderId,
        apiStatus: colis.etat,
        paymentStatus,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        ...(colis.prix > 0 && { amount: colis.prix }),
      },
    });
    paymentUpdated = true;
  } else {
    await prisma.deliveryRevenue.create({
      data: {
        team: { connect: { id: teamId } },
        provider: "COLISSIMO", source: "API_SYNC",
        ...(orderId && { order: { connect: { id: orderId } } }),
        trackingNumber: colis.codeBar,
        reference: colis.reference,
        amount: colis.prix || 0,
        deliveryFee: colis.fraisLivraison || 0,
        returnFee: colis.fraisRetour || 0,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netAmount: Math.max(0, (colis.prix || 0) - (colis.fraisLivraison || 0) - (colis.fraisRetour || 0) - finance.withholdingTaxApplied),
        apiStatus: colis.etat,
        paymentNumber: colis.numPaiement,
        paymentStatus, isValidated: false,
        customerName: colis.client,
        rawData: colis,
      },
    });
    paymentCreated = isPaymentReceived;
  }

  return { action, paymentCreated, paymentUpdated };
}

// ── InstaDelivery sync ────────────────────────────────────────────────
async function syncInstaDelivery(teamId: string): Promise<SyncProviderResult> {
  const result: SyncProviderResult = {
    provider: "INSTADELIVERY",
    ordersCreated: 0, ordersUpdated: 0,
    paymentsCreated: 0, paymentsUpdated: 0,
    errorsCount: 0,
  };

  const config = await getInstaDeliveryConfig(teamId);
  if (!config) return result;

  try {
    // Sync tracking for all existing InstaDelivery orders
    const orders = await prisma.order.findMany({
      where: {
        teamId,
        trackingNumber: { not: null },
        shippingProvider: { contains: "INSTA", mode: "insensitive" },
      },
      select: { trackingNumber: true }
    });
    let created = 0, synced = 0, failed = 0;
    for (const o of orders) {
      if (!o.trackingNumber) continue;
      try {
        // Use config.id (real configId) so credentials are fetched correctly
        const r = await syncInstaDeliveryTracking(config.id, o.trackingNumber);
        if (r.success && r.action === "created") created++;
        else if (r.success && r.action !== "ignored") synced++;
        else if (!r.success) failed++;
      } catch {
        failed++;
      }
    }
    result.ordersCreated += created;
    result.ordersUpdated += synced;
    result.errorsCount += failed;
  } catch (e) {
    result.errorsCount++;
    result.errorMessage = e instanceof Error ? e.message : "Erreur sync tracking";
  }

  try {
    // Sync payments/revenues
    const revenueResult = await syncAllInstaDeliveryRevenue(teamId);
    result.paymentsCreated += revenueResult.imported || 0;
    result.paymentsUpdated += revenueResult.updated || 0;
  } catch (e) {
    result.errorsCount++;
    console.error("[Sync/InstaDelivery] revenue sync error:", e);
  }

  return result;
}
