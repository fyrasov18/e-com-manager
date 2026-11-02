// src/lib/cosmos-crypto.ts — Chiffrement AES-256-GCM pour le token Bearer API Cosmos.
import crypto from "node:crypto";

function getKey(): Buffer | null {
  const raw =
    process.env.COSMOS_SECRET_KEY ||
    process.env.INTIGO_SECRET_KEY ||
    process.env.COLISSIMO_SECRET_KEY ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "";
  if (!raw) return null;
  return crypto.createHash("sha256").update(String(raw), "utf8").digest();
}

export function isEncryptedValue(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith("enc:");
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key) {
    throw new Error(
      "Chiffrement impossible: configurez COSMOS_SECRET_KEY (ou AUTH_SECRET / NEXTAUTH_SECRET)."
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
  if (!isEncryptedValue(stored)) return String(stored);
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

export function maskApiToken(token: string | null | undefined): string {
  if (!token) return "—";
  const s = String(token).trim();
  if (s.length <= 12) return "••••••••";
  return `${s.slice(0, 8)}••••${s.slice(-6)}`;
}
