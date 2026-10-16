export function normalizeTrackingCode(input: unknown): string {
  return String(input ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .trim()
    .toUpperCase();
}

export function parseTrackingCodes(rawText: unknown): string[] {
  return String(rawText ?? "")
    .split(/\r?\n|,|;/)
    .map(normalizeTrackingCode)
    .filter((code) => code.length > 0);
}

export function isValidTrackingCode(code: string): boolean {
  if (!code || typeof code !== "string") return false;
  const clean = code.trim().toUpperCase();
  // Colissimo / InstaDelivery (10 à 18 chiffres)
  if (/^\d{10,18}$/.test(clean)) return true;
  // Code-barres Intigo : ex. 8743434S8 (chiffres + lettre(s) + chiffres)
  if (/^\d{5,10}[A-Z]\d{1,4}$/.test(clean)) return true;
  // Format général alphanumérique 6 à 25 caractères
  if (/^[A-Z0-9_-]{6,25}$/.test(clean)) return true;
  return false;
}

export function detectTrackingProvider(code: string): "Colissimo" | "InstaDelivery" | "Intigo" | "Unknown" {
  const clean = String(code ?? "").trim().toUpperCase();
  if (/^300\d{9,11}$/.test(clean)) return "Colissimo";
  if (/^70\d{10,16}$/.test(clean)) return "InstaDelivery";
  if (/^INTIGO/i.test(clean) || /^INT/i.test(clean)) return "Intigo";
  // Format code-barres Intigo type 8743434S8 (7 chiffres + lettre + 1 chiffre)
  if (/^\d{5,10}[A-Z]\d{1,4}$/i.test(clean)) return "Intigo";
  // Format alphanumérique avec lettre
  if (/^[0-9A-Z]{7,15}$/i.test(clean) && /[A-Z]/i.test(clean)) return "Intigo";
  return "Unknown";
}
