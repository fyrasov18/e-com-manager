// Intigo HTTP client (serveur uniquement) — X-API-Key, timeout, erreurs FR.
import { resolveIntigoConfig, type ResolvedIntigoConfig } from "@/lib/intigo-config";

export const INTIGO_FETCH_TIMEOUT_MS = 15_000;
export type IntigoApiError = { ok: false; httpStatus: number; code: string; message: string; details?: unknown };
export type IntigoResult<T> = { ok: true; data: T } | IntigoApiError;

function redact(h: Record<string, string>) {
  const c = { ...h };
  if (c["X-API-Key"]) c["X-API-Key"] = "***REDACTED***";
  return c;
}

async function intigoFetch(cfg: ResolvedIntigoConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), INTIGO_FETCH_TIMEOUT_MS);
  try {
    const headers = { "Content-Type": "application/json", Accept: "application/json", "X-API-Key": cfg.apiKey, ...((init.headers || {}) as any) };
    console.log("[Intigo]", init.method || "GET", `${cfg.baseUrl}${path}`, JSON.stringify(redact(headers)));
    return await fetch(`${cfg.baseUrl}${path}`, { ...init, headers, signal: ctrl.signal });
  } finally { clearTimeout(t); }
}

async function parseSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 1000) }; }
}

export function mapIntigoHttpError(status: number, body: any): { code: string; message: string } {
  const srv = (body && (body.message || body.error || body.detail || body.title)) || "";
  if (status === 400) return { code: "VALIDATION", message: `Données invalides: ${srv || "vérifiez les champs"}` };
  if (status === 401) return { code: "INVALID_API_KEY", message: "Clé API absente ou invalide (401)." };
  if (status === 402) return { code: "PAYMENT_REQUIRED", message: `Solde insuffisant (402). ${srv}`.trim() };
  if (status === 404) return { code: "NOT_FOUND", message: `Introuvable (404). ${srv}`.trim() };
  if (status === 409) return { code: "CONFLICT", message: `Conflit de statut (409). ${srv || "action incompatible"}` };
  if (status === 500) return { code: "UPSTREAM_5XX", message: `Erreur interne Intigo (500). ${srv}`.trim() };
  if (status === 503) return { code: "UPSTREAM_5XX", message: "Service Intigo indisponible (503)." };
  if (status >= 500) return { code: "UPSTREAM_5XX", message: `Erreur Intigo (${status}). ${srv}`.trim() };
  return { code: "UNKNOWN", message: `Erreur Intigo (${status}). ${srv}`.trim() };
}

export async function requestIntigo<T>(teamId: string, path: string, init: RequestInit = {}): Promise<IntigoResult<T>> {
  const cfg = await resolveIntigoConfig(teamId);
  if (!cfg) return { ok: false, httpStatus: 401, code: "MISSING_API_KEY", message: "Clé API Intigo non configurée." };
  let res: Response;
  try { res = await intigoFetch(cfg, path, init); }
  catch (err: any) {
    const timeout = err?.name === "AbortError";
    return { ok: false, httpStatus: 0, code: "NETWORK", message: timeout ? "Timeout réseau Intigo (15s). Vérifiez avant de réessayer (anti-doublon)." : (err?.message || "Erreur réseau") };
  }
  const body = await parseSafe(res);
  if (!res.ok) {
    const m = mapIntigoHttpError(res.status, body);
    return { ok: false, httpStatus: res.status, code: m.code, message: m.message, details: body };
  }
  return { ok: true, data: body as T };
}
