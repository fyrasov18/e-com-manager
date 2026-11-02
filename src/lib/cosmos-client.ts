// src/lib/cosmos-client.ts — Client HTTP pour l'API Cosmos (serveur uniquement).
import { resolveCosmosConfig, type ResolvedCosmosConfig } from "@/lib/cosmos-config";

export const COSMOS_FETCH_TIMEOUT_MS = 15_000;

export type CosmosApiError = {
  ok: false;
  httpStatus: number;
  code: string;
  message: string;
  details?: unknown;
};

export type CosmosResult<T> = { ok: true; data: T } | CosmosApiError;

function redact(headers: Record<string, string>) {
  const c = { ...headers };
  if (c["Authorization"]) c["Authorization"] = "Bearer ***REDACTED***";
  return c;
}

async function cosmosFetch(
  cfg: ResolvedCosmosConfig,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), COSMOS_FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${cfg.apiToken}`,
      ...((init.headers || {}) as any),
    };
    console.log(
      "[Cosmos]",
      init.method || "GET",
      `${cfg.baseUrl}${path}`,
      JSON.stringify(redact(headers))
    );
    return await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

async function parseSafe(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/pdf") || contentType.includes("text/html")) {
    return null;
  }
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 1000) };
  }
}

export function mapCosmosHttpError(status: number, body: any): { code: string; message: string } {
  const srv = (body && (body.message || body.error || body.detail || body.title)) || "";
  if (status === 400) return { code: "VALIDATION", message: srv || "Données invalides pour Cosmos" };
  if (status === 401) return { code: "UNAUTHORIZED", message: "Token Bearer Cosmos invalide ou expiré (401)" };
  if (status === 404) return { code: "NOT_FOUND", message: srv || "Commande ou ressource Cosmos introuvable (404)" };
  if (status === 429) return { code: "RATE_LIMIT", message: "Limite d'appels API Cosmos dépassée (429)" };
  if (status >= 500) return { code: "UPSTREAM_5XX", message: `Erreur serveur Cosmos (${status}). ${srv}`.trim() };
  return { code: "UNKNOWN", message: `Erreur Cosmos (${status}). ${srv}`.trim() };
}

export async function requestCosmos<T>(
  teamId: string,
  path: string,
  init: RequestInit = {}
): Promise<CosmosResult<T>> {
  const cfg = await resolveCosmosConfig(teamId);
  if (!cfg) {
    return {
      ok: false,
      httpStatus: 401,
      code: "MISSING_API_TOKEN",
      message: "Token API Cosmos non configuré.",
    };
  }

  let res: Response;
  try {
    res = await cosmosFetch(cfg, path, init);
  } catch (err: any) {
    const timeout = err?.name === "AbortError";
    return {
      ok: false,
      httpStatus: 0,
      code: "NETWORK",
      message: timeout ? "Délai d'attente dépassé (15s) pour Cosmos." : err?.message || "Erreur réseau Cosmos",
    };
  }

  const body = await parseSafe(res);
  if (!res.ok) {
    const m = mapCosmosHttpError(res.status, body);
    return {
      ok: false,
      httpStatus: res.status,
      code: m.code,
      message: m.message,
      details: body,
    };
  }

  return { ok: true, data: body as T };
}
