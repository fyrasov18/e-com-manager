// src/lib/intigo-crypto.ts — Chiffrement AES-256-GCM pour la clé API Intigo.
// Format stocké: "enc:<base64(iv(12) + tag(16) + ciphertext)>"
// Fallback lecture: valeur sans préfixe = clair (migration legacy).
import crypto from "node:crypto";

function getKey(): Buffer | null {
  const raw =
    process.env.INTIGO_SECRET_KEY ||
    process.env.COLISSIMO_SECRET_KEY ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "";
  if (!raw) return null;
  // Dérivation stable 32 octets via SHA-256 (évite d'exiger une clé hex exacte).
  return crypto.createHash("sha256").update(String(raw), "utf8").digest();
}

export function isEncryptedValue(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith("enc:");
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key) {
    // Sans clé de chiffrement configurée, on ne peut pas chiffrer.
    // On lève plutôt que de stocker en clair silencieusement.
    throw new Error(
      "Chiffrement impossible: configurez INTIGO_SECRET_KEY (ou COLISSIMO_SECRET_KEY / AUTH_SECRET)."
    );
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plain ?? ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!isEncryptedValue(stored)) return String(stored); // legacy clair
  const key = getKey();
  if (!key) throw new Error("Déchiffrement impossible: clé secrète manquante.");
  const raw = Buffer.from(String(stored).slice(4), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Ne jamais exposer la clé complète au frontend/logs. */
export function maskApiKey(key: string | null | undefined): string {
  if (!key) return "—";
  const s = String(key);
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}
