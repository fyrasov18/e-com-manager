export function normalizeTrackingCode(input: unknown): string {
  return String(input ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, "")
    .replace(/[^\d]/g, "")
    .trim();
}

export function parseTrackingCodes(rawText: unknown): string[] {
  return String(rawText ?? "")
    .split(/\r?\n|,|;/)
    .map(normalizeTrackingCode)
    .filter((code) => code.length > 0);
}

export function isValidTrackingCode(code: string): boolean {
  return /^\d{10,18}$/.test(code);
}

export function detectTrackingProvider(code: string): "Colissimo" | "InstaDelivery" | "Unknown" {
  if (/^300\d{9,11}$/.test(code)) return "Colissimo";
  if (/^70\d{10,16}$/.test(code)) return "InstaDelivery";
  return "Unknown";
}
