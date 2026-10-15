// Intigo Partner V3 — barrel (serveur uniquement).
// Base: https://api.intigo.net/api/v3 — Auth: X-API-Key.
export const INTIGO_DEFAULT_BASE_URL = "https://api.intigo.net/api/v3";
export function intigoBaseUrlFromEnv(): string {
  return (process.env.INTIGO_API_BASE_URL?.trim() || INTIGO_DEFAULT_BASE_URL).replace(/\/$/, "");
}

