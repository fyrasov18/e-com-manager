// Intigo parcels API (serveur uniquement).
import { requestIntigo } from "@/lib/intigo-client";
import { validateIntigoCreateByIds } from "@/lib/intigo-domain";
import { resolveIntigoConfig } from "@/lib/intigo-config";

export async function intigoHealth() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch("https://api.intigo.net/health", { signal: ctrl.signal });
      const body = await res.text();
      let data: any = body.slice(0, 500);
      try { data = JSON.parse(body); } catch {}
      if (!res.ok) return { ok: false as const, httpStatus: res.status, code: "UPSTREAM_5XX", message: `Health: HTTP ${res.status}` };
      return { ok: true as const, data };
    } finally { clearTimeout(t); }
  } catch (e: any) {
    return { ok: false as const, httpStatus: 0, code: "NETWORK", message: e?.message || "Health injoignable" };
  }
}

export async function listCities(teamId: string) {
  return requestIntigo<any>(teamId, "/regions/cities", { method: "GET" });
}
export async function listDistricts(teamId: string, cityId: number) {
  return requestIntigo<any>(teamId, `/regions/cities/${cityId}/districts`, { method: "GET" });
}
export async function listNeighborhoods(teamId: string, districtId: number) {
  return requestIntigo<any>(teamId, `/regions/districts/${districtId}/neighborhoods`, { method: "GET" });
}
export async function listPickups(teamId: string) {
  return requestIntigo<any>(teamId, "/pickup-addresses/", { method: "GET" });
}

export async function createParcelByIds(teamId: string, payload: any) {
  const v = validateIntigoCreateByIds(payload);
  if (!v.valid) return { ok: false as const, httpStatus: 400, code: "VALIDATION", message: `Validation: ${v.errors.join("; ")}` };
  return requestIntigo<any>(teamId, "/parcels/", { method: "POST", body: JSON.stringify(v.value) });
}

export async function createParcelByName(teamId: string, p: Record<string, any>) {
  for (const k of ["destination_city_id", "destination_district_id", "destination_neighborhood_id"]) {
    if (p[k] !== undefined) return { ok: false as const, httpStatus: 400, code: "VALIDATION", message: `Ne mélangez pas ids et noms: retirez ${k}.` };
  }
  if (!p.city_name || !p.district_name || !p.recipient_name || !p.phone1 || !p.destination_address || p.pickup_index === undefined) {
    return { ok: false as const, httpStatus: 400, code: "VALIDATION", message: "by-name requiert recipient_name, phone1, destination_address, city_name, district_name, pickup_index." };
  }
  return requestIntigo<any>(teamId, "/parcels/by-name", { method: "POST", body: JSON.stringify(p) });
}

export async function getParcel(teamId: string, nid: string) {
  return requestIntigo<any>(teamId, `/parcels/${encodeURIComponent(nid)}`, { method: "GET" });
}
export async function getParcelHistory(teamId: string, nid: string) {
  return requestIntigo<any>(teamId, `/parcels/${encodeURIComponent(nid)}/history`, { method: "GET" });
}
export async function listParcels(teamId: string, q?: Record<string, string>) {
  const qs = q ? `?${new URLSearchParams(q).toString()}` : "";
  return requestIntigo<any>(teamId, `/parcels/${qs}`, { method: "GET" });
}
export async function patchParcel(teamId: string, nid: string, patch: Record<string, any>) {
  return requestIntigo<any>(teamId, `/parcels/${encodeURIComponent(nid)}`, { method: "PATCH", body: JSON.stringify(patch) });
}

const ACTIONS = new Set(["change-address", "change-phone", "change-price", "reroute", "cancel", "relance", "report-delay"]);
export async function parcelAction(teamId: string, nid: string, action: string, body: Record<string, any> = {}) {
  if (!ACTIONS.has(action)) return { ok: false as const, httpStatus: 400, code: "VALIDATION", message: `Action inconnue: ${action}` };
  return requestIntigo<any>(teamId, `/parcels/${encodeURIComponent(nid)}/${action}`, { method: "POST", body: JSON.stringify(body) });
}
export async function createExchange(teamId: string, p: Record<string, any>) {
  return requestIntigo<any>(teamId, "/parcels/exchange", { method: "POST", body: JSON.stringify(p) });
}

export async function testConnection(teamId: string) {
  const cfg = await resolveIntigoConfig(teamId);
  if (!cfg) return { success: false, message: "Clé API Intigo non configurée." };
  const r = await listPickups(teamId);
  const msg = r.ok ? "Connexion Intigo OK (adresses de ramassage accessibles)." : (r as any).message;
  try {
    const { prisma } = await import("@/lib/prisma");
    await (prisma as any).intigoIntegration.updateMany({ where: { teamId }, data: { lastTested: new Date(), lastError: r.ok ? null : msg } });
  } catch {}
  return { success: r.ok, message: msg };
}
