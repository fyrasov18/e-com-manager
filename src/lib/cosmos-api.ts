// src/lib/cosmos-api.ts — Opérations complètes pour l'API Cosmos Delivery.
import { requestCosmos } from "@/lib/cosmos-client";
import { resolveCosmosConfig, cosmosBaseUrlFromEnv } from "@/lib/cosmos-config";
import type { CosmosCreateOrderInput, CosmosOrderData } from "@/lib/cosmos-domain";
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
