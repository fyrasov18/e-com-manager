// src/lib/cosmos-api.ts — Opérations complètes pour l'API Cosmos Delivery.
import { requestCosmos } from "@/lib/cosmos-client";
import { resolveCosmosConfig, cosmosBaseUrlFromEnv } from "@/lib/cosmos-config";
import type { CosmosCreateOrderInput, CosmosOrderData } from "@/lib/cosmos-domain";
import { mapCosmosStatus, cosmosStatusLabel } from "@/lib/cosmos-domain";
import { parseOperationDate } from "@/lib/date-utils";
import { getFinanceSettings, calculateOrderFinance } from "@/lib/finance";
import { isReturnStatus } from "@/lib/delivery-status";
import { prisma } from "@/lib/prisma";

export async function testCosmosConnection(teamId: string): Promise<{ success: boolean; message: string }> {
  const cfg = await resolveCosmosConfig(teamId);
  if (!cfg) {
    return { success: false, message: "Token Bearer Cosmos non configuré." };
  }

  // On teste en appelant GET /orders?limit=1
  const r = await requestCosmos<{ success: boolean; data?: any[] }>(teamId, "/orders?limit=1", {
    method: "GET",
  });

  const msg = r.ok ? "Connexion Cosmos Delivery réussie ✓ (Token Bearer valide)." : r.message;

  try {
    await (prisma as any).cosmosIntegration.updateMany({
      where: { teamId },
      data: {
        lastTested: new Date(),
        lastError: r.ok ? null : msg,
      },
    });
  } catch {}

  return { success: r.ok, message: msg };
}

export async function createCosmosOrder(teamId: string, input: CosmosCreateOrderInput) {
  return requestCosmos<{ success: boolean; message?: string; data: CosmosOrderData }>(
    teamId,
    "/orders",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export async function listCosmosOrders(
  teamId: string,
  params?: { page?: number; limit?: number; barcode?: string; printed?: boolean }
) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.barcode) qs.set("barcode", params.barcode);
  if (params?.printed !== undefined) qs.set("printed", String(params.printed));

  const query = qs.toString() ? `?${qs.toString()}` : "";
  return requestCosmos<{ success: boolean; count?: number; data: CosmosOrderData[] }>(
    teamId,
    `/orders${query}`,
    { method: "GET" }
  );
}

export async function getCosmosOrderByBarcode(teamId: string, barcode: string) {
  const r = await listCosmosOrders(teamId, { barcode, limit: 1 });
  if (!r.ok) return r;
  const list = r.data.data ?? [];
  const found = list.find((o) => o.barcode === barcode || o.id === barcode || o.integrationBarcode === barcode);
  if (!found) {
    return { ok: false as const, httpStatus: 404, code: "NOT_FOUND", message: `Colis Cosmos non trouvé (${barcode})` };
  }
  return { ok: true as const, data: found };
}

export async function deleteCosmosOrder(teamId: string, barcode: string) {
  return requestCosmos<{ success: boolean; message: string }>(
    teamId,
    `/orders?barcode=${encodeURIComponent(barcode)}`,
    { method: "DELETE" }
  );
}

export async function markCosmosOrdersPrinted(
  teamId: string,
  barcodes: string[],
  printed: boolean = true
) {
  return requestCosmos<{
    success: boolean;
    printed: boolean;
    updated: string[];
    unchanged: string[];
    notFound: string[];
    notPending: string[];
  }>(teamId, "/orders/printed", {
    method: "PUT",
    body: JSON.stringify({ barcodes, printed }),
  });
}

export async function trackCosmosPublic(search: string) {
  const baseUrl = cosmosBaseUrlFromEnv();
  try {
    const res = await fetch(`${baseUrl}/track?search=${encodeURIComponent(search)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false as const, message: data.message || `Erreur suivi (${res.status})`, httpStatus: res.status };
    }
    return { ok: true as const, data };
  } catch (err: any) {
    return { ok: false as const, message: err?.message || "Erreur réseau public track", httpStatus: 0 };
  }
}

export async function listCosmosPayments(teamId: string, page = 1, limit = 20) {
  return requestCosmos<{
    success: boolean;
    data: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(teamId, `/payments?page=${page}&limit=${limit}`, { method: "GET" });
}

export async function getCosmosPayment(teamId: string, paymentId: number | string) {
  return requestCosmos<{ success: boolean; data: any }>(
    teamId,
    `/payments/${paymentId}`,
    { method: "GET" }
  );
}

export async function receiveCosmosPayment(teamId: string, paymentId: number | string) {
  return requestCosmos<{ success: boolean; data: any; message?: string }>(
    teamId,
    `/payments/${paymentId}/receive`,
    { method: "PUT" }
  );
}

export interface CosmosLabelParsedDetails {
  barcode: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  totalAmount: number;
  productName: string;
  quantity: number;
}

/**
 * Extrait les coordonnées destinataire, ville, montant et produit depuis le HTML des bordereaux Cosmos.
 */
export function parseCosmosLabelsHtml(html: string): Map<string, CosmosLabelParsedDetails> {
  const map = new Map<string, CosmosLabelParsedDetails>();
  if (!html) return map;

  const containers = html.split(/<div class="container">/i).slice(1);

  for (const block of containers) {
    const blfMatch = block.match(/BON DE LIVRAISON N°\s*([0-9A-Za-z_-]+)/i);
    const barcode = blfMatch ? blfMatch[1].trim() : "";
    if (!barcode) continue;

    const cityMatch = block.match(/Destination:<\/span>\s*<span class="value[^"]*">([^<]+)<\/span>/i);

    // Section Destinataire (pour ne pas confondre avec l'expéditeur)
    const destIdx = block.indexOf("Destinataire:");
    const recipSlice = destIdx !== -1 ? block.slice(destIdx, destIdx + 1200) : block;

    const destMatch = recipSlice.match(/Destinataire:<\/span>\s*<span class="value[^"]*">([^<]+)<\/span>/i);
    const addrMatch = recipSlice.match(/Adresse:<\/span>\s*<span class="value[^"]*">([^<]+)<\/span>/i);
    const telMatch = recipSlice.match(/Téléphone:<\/span>\s*<span class="value[^"]*">([^<]+)<\/span>/i);

    const amountMatch = block.match(/<td class="amount[^"]*">([^<]+)<\/td>/i);
    const itemMatch = block.match(/<tbody>\s*<tr>\s*<td>([^<]+)<\/td>\s*<td class="quantity[^"]*">([^<]+)<\/td>/i);

    const rawAmount = amountMatch ? amountMatch[1].replace(/[^0-9.,]/g, "").replace(",", ".").trim() : "0";
    const totalAmount = parseFloat(rawAmount) || 0;

    map.set(barcode, {
      barcode,
      customerName: destMatch ? destMatch[1].trim() : "",
      customerPhone: telMatch ? telMatch[1].trim() : "",
      shippingAddress: addrMatch ? addrMatch[1].trim() : "",
      shippingCity: cityMatch ? cityMatch[1].trim() : "",
      totalAmount,
      productName: itemMatch ? itemMatch[1].trim() : "",
      quantity: itemMatch ? parseInt(itemMatch[2].trim(), 10) || 1 : 1,
    });
  }

  return map;
}

/**
 * Récupère le HTML des bordereaux et extrait les données complètes pour une liste de codes-barres.
 */
export async function fetchCosmosOrderFullDetails(
  teamId: string,
  barcodes: string[]
): Promise<Map<string, CosmosLabelParsedDetails>> {
  const map = new Map<string, CosmosLabelParsedDetails>();
  if (!barcodes.length) return map;

  const cfg = await resolveCosmosConfig(teamId);
  if (!cfg) return map;

  const BATCH = 30;
  for (let i = 0; i < barcodes.length; i += BATCH) {
    const batch = barcodes.slice(i, i + BATCH);
    try {
      const res = await fetch(`${cfg.baseUrl}/labels?barcode=${encodeURIComponent(batch.join(","))}`, {
        headers: {
          Authorization: `Bearer ${cfg.apiToken}`,
          Accept: "text/html",
        },
      });
      if (res.ok) {
        const html = await res.text();
        const parsed = parseCosmosLabelsHtml(html);
        for (const [k, v] of parsed.entries()) {
          map.set(k, v);
        }
      }
    } catch (e) {
      console.warn("[Cosmos] fetchCosmosOrderFullDetails batch error:", e);
    }
  }

  return map;
}

/**
 * Synchronise l'intégralité des commandes Cosmos (liste en temps réel + bordereaux)
 * vers les tables Order et CosmosOrder.
 */
export async function syncAllCosmosOrders(teamId: string): Promise<{
  success: boolean;
  total: number;
  created: number;
  updated: number;
  error?: string;
}> {
  const cfg = await resolveCosmosConfig(teamId);
  if (!cfg) {
    return { success: false, total: 0, created: 0, updated: 0, error: "Cosmos non configuré" };
  }

  // 1. Lister les commandes en direct depuis Cosmos API
  const apiRes = await listCosmosOrders(teamId, { limit: 100 });
  if (!apiRes.ok || !Array.isArray(apiRes.data?.data)) {
    return {
      success: false,
      total: 0,
      created: 0,
      updated: 0,
      error: !apiRes.ok ? apiRes.message : "Données invalides",
    };
  }

  const cosmosOrders = apiRes.data.data;
  if (cosmosOrders.length === 0) {
    return { success: true, total: 0, created: 0, updated: 0 };
  }

  const barcodes = cosmosOrders.map((o) => o.barcode).filter(Boolean);

  // 2. Récupérer les détails complets (destinataire, tel, adresse, montant) depuis les bordereaux
  const detailsMap = await fetchCosmosOrderFullDetails(teamId, barcodes);

  const settings = await getFinanceSettings(teamId, "COSMOS");

  let created = 0;
  let updated = 0;

  for (const co of cosmosOrders) {
    const barcode = String(co.barcode || co.id || "").trim();
    if (!barcode) continue;

    const cosmosId = String(co.id || co.barcode || barcode);
    const details = detailsMap.get(barcode) || detailsMap.get(barcode.padStart(12, "0"));

    const customerName = details?.customerName || co.name || "Client";
    const customerPhone = details?.customerPhone || co.phone || "";
    const shippingAddress = details?.shippingAddress || co.address || "";
    const shippingCity = details?.shippingCity || co.city || "";
    const totalAmount = details?.totalAmount || Number(co.totalAmount) || 0;
    const productName = details?.productName || co.content || "";
    const quantity = details?.quantity || Number(co.quantity) || 1;

    const mappedStatus = mapCosmosStatus(co.status);
    const statusLabel = cosmosStatusLabel(co.status);
    const isReturn = isReturnStatus(mappedStatus);

    const finance = calculateOrderFinance({
      totalAmount,
      status: mappedStatus,
      settings,
    });

    const opDate = parseOperationDate(co.updatedAt || co.createdAt) || null;
    const isDelivered = mappedStatus === "DELIVERED" || mappedStatus === "PAID_DELIVERED";
    const isPickedUp = mappedStatus === "PICKED_UP" || mappedStatus === "READY_FOR_PICKUP";

    const existing = await prisma.order.findFirst({
      where: {
        teamId,
        shippingProvider: "COSMOS",
        OR: [
          { trackingNumber: barcode },
          { trackingNumber: cosmosId },
          ...(co.externalBarcode ? [{ reference: co.externalBarcode }] : []),
          ...(co.integrationBarcode ? [{ reference: co.integrationBarcode }] : []),
        ],
      },
    });

    let orderId = "";

    if (existing) {
      orderId = existing.id;
      await prisma.order.update({
        where: { id: existing.id },
        data: {
          status: mappedStatus,
          apiStatus: statusLabel,
          customerName: customerName || existing.customerName,
          customerPhone: customerPhone || existing.customerPhone,
          shippingAddress: shippingAddress || existing.shippingAddress,
          shippingCity: shippingCity || existing.shippingCity,
          productName: productName || existing.productName,
          quantity: quantity || existing.quantity,
          revenue: totalAmount > 0 ? totalAmount : existing.revenue,
          validatedRevenue: finance.validatedRevenue,
          deliveryCostApplied: finance.deliveryCostApplied,
          returnCostApplied: finance.returnCostApplied,
          withholdingTaxApplied: finance.withholdingTaxApplied,
          netProfit: finance.netProfit,
          operationDate: opDate ?? existing.operationDate,
          deliveredAt: isDelivered && opDate ? opDate : existing.deliveredAt,
          pickedUpAt: isPickedUp && opDate ? opDate : existing.pickedUpAt,
          importedAt: new Date(),
        },
      });
      updated++;
    } else {
      const newOrder = await prisma.order.create({
        data: {
          teamId,
          status: mappedStatus,
          revenue: totalAmount,
          cost: 0,
          profit: 0,
          validatedRevenue: finance.validatedRevenue,
          deliveryCostApplied: finance.deliveryCostApplied,
          returnCostApplied: finance.returnCostApplied,
          withholdingTaxApplied: finance.withholdingTaxApplied,
          netProfit: finance.netProfit,
          shippingProvider: "COSMOS",
          trackingNumber: barcode,
          reference: co.externalBarcode || co.integrationBarcode || undefined,
          customerName,
          customerPhone,
          shippingAddress,
          shippingCity,
          productName,
          quantity,
          apiStatus: statusLabel,
          operationDate: opDate ?? undefined,
          deliveredAt: isDelivered && opDate ? opDate : undefined,
          pickedUpAt: isPickedUp && opDate ? opDate : undefined,
          date: opDate ?? new Date(),
          importedAt: new Date(),
        },
      });
      orderId = newOrder.id;
      created++;
    }

    // Upsert CosmosOrder
    try {
      await (prisma as any).cosmosOrder.upsert({
        where: { teamId_cosmosId: { teamId, cosmosId } },
        create: {
          teamId,
          orderId,
          cosmosId,
          barcode,
          name: customerName,
          phone: customerPhone,
          address: shippingAddress,
          city: shippingCity,
          status: co.status,
          paymentStatus: co.paymentStatus,
          totalAmount,
          quantity,
          content: productName,
          printed: Boolean(co.printed),
          externalBarcode: co.externalBarcode,
          integrationBarcode: co.integrationBarcode,
          labelUrl: `/api/cosmos/labels?barcode=${barcode}`,
          rawDetail: co,
          lastSyncAt: new Date(),
        },
        update: {
          orderId,
          barcode,
          name: customerName,
          phone: customerPhone,
          address: shippingAddress,
          city: shippingCity,
          status: co.status,
          paymentStatus: co.paymentStatus,
          totalAmount,
          quantity,
          content: productName,
          printed: Boolean(co.printed),
          labelUrl: `/api/cosmos/labels?barcode=${barcode}`,
          rawDetail: co,
          lastSyncAt: new Date(),
        },
      });
    } catch (e) {
      console.warn("[Cosmos] cosmosOrder upsert warn:", e);
    }
  }

  // Mettre à jour lastSyncAt sur l'intégration
  await (prisma as any).cosmosIntegration.updateMany({
    where: { teamId },
    data: { lastSyncAt: new Date(), lastError: null },
  }).catch(() => {});

  return { success: true, total: cosmosOrders.length, created, updated };
}
