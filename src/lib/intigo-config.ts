// Intigo config (serveur uniquement) — résolution DB chiffrée puis env.
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, maskApiKey } from "@/lib/intigo-crypto";
import { INTIGO_DEFAULT_BASE_URL, intigoBaseUrlFromEnv } from "@/lib/intigo";

export type ResolvedIntigoConfig = {
  baseUrl: string; apiKey: string; source: "db" | "env"; teamId: string;
  defaultPickupIndex: number | null; platform: string; platformVersion: string; shopUrl: string;
};

export async function getIntigoDbRow(teamId: string) {
  try { return await (prisma as any).intigoIntegration.findUnique({ where: { teamId } }); }
  catch { return null; }
}

export async function resolveIntigoConfig(teamId: string): Promise<ResolvedIntigoConfig | null> {
  const row = await getIntigoDbRow(teamId);
  if (row && row.isActive) {
    try {
      const key = decryptSecret(row.apiKeyEncrypted).trim();
      if (key) {
        return {
          baseUrl: (row.baseUrl || intigoBaseUrlFromEnv()).replace(/\/$/, ""),
          apiKey: key, source: "db", teamId,
          defaultPickupIndex: row.defaultPickupIndex ?? null,
          platform: row.platform || process.env.INTIGO_PLATFORM || "ecom_collab",
          platformVersion: row.platformVersion || process.env.INTIGO_PLATFORM_VERSION || "",
          shopUrl: row.shopUrl || process.env.INTIGO_SHOP_URL || "",
        };
      }
    } catch (e) { console.error("[Intigo] decrypt failed"); }
  }
  const envKey = (process.env.INTIGO_API_KEY || "").trim();
  if (envKey) {
    const p = Number(process.env.INTIGO_DEFAULT_PICKUP_INDEX);
    return {
      baseUrl: intigoBaseUrlFromEnv(), apiKey: envKey, source: "env", teamId,
      defaultPickupIndex: Number.isFinite(p) ? p : null,
      platform: process.env.INTIGO_PLATFORM || "ecom_collab",
      platformVersion: process.env.INTIGO_PLATFORM_VERSION || "",
      shopUrl: process.env.INTIGO_SHOP_URL || "",
    };
  }
  return null;
}

export async function getIntigoConfigSafe(teamId: string) {
  const row = await getIntigoDbRow(teamId);
  const resolved = await resolveIntigoConfig(teamId);
  if (!resolved) {
    return {
      configured: false, source: "none", baseUrl: intigoBaseUrlFromEnv(),
      platform: process.env.INTIGO_PLATFORM || "ecom_collab",
      platformVersion: process.env.INTIGO_PLATFORM_VERSION || null,
      shopUrl: process.env.INTIGO_SHOP_URL || null,
      defaultPickupIndex: null, isActive: false, maskedKey: "—",
      lastTested: null, lastError: row?.lastError ?? null, lastSyncAt: null,
    };
  }
  return {
    configured: true, source: resolved.source, baseUrl: resolved.baseUrl,
    platform: resolved.platform, platformVersion: resolved.platformVersion || null,
    shopUrl: resolved.shopUrl || null, defaultPickupIndex: resolved.defaultPickupIndex,
    isActive: row?.isActive ?? true, maskedKey: maskApiKey(resolved.apiKey),
    lastTested: row?.lastTested ? row.lastTested.toISOString() : null,
    lastError: row?.lastError ?? null,
    lastSyncAt: row?.lastSyncAt ? row.lastSyncAt.toISOString() : null,
  };
}

export async function saveIntigoConfig(teamId: string, input: Record<string, any>) {
  try {
    const existing = await getIntigoDbRow(teamId);
    let encrypted = existing?.apiKeyEncrypted ?? "";
    if (typeof input.apiKey === "string" && input.apiKey.trim()) {
      encrypted = encryptSecret(input.apiKey.trim());
    }
    if (!encrypted) {
      const envKey = (process.env.INTIGO_API_KEY || "").trim();
      if (!envKey) return { success: false, message: "Clé API Intigo requise (ou INTIGO_API_KEY)." };
      try { encrypted = encryptSecret(envKey); }
      catch { return { success: false, message: "Chiffrement impossible: configurez INTIGO_SECRET_KEY." }; }
    }
    const data = {
      apiKeyEncrypted: encrypted,
      baseUrl: (input.baseUrl?.trim?.() || existing?.baseUrl || intigoBaseUrlFromEnv()).replace(/\/$/, ""),
      platform: input.platform?.trim?.() || existing?.platform || process.env.INTIGO_PLATFORM || "ecom_collab",
      platformVersion: input.platformVersion?.trim?.() ?? existing?.platformVersion ?? null,
      shopUrl: input.shopUrl?.trim?.() ?? existing?.shopUrl ?? null,
      defaultPickupIndex: input.defaultPickupIndex !== undefined ? input.defaultPickupIndex : (existing?.defaultPickupIndex ?? null),
      isActive: input.isActive ?? existing?.isActive ?? true,
      lastError: null,
    };
    await (prisma as any).intigoIntegration.upsert({ where: { teamId }, update: data, create: { teamId, ...data } });
    return { success: true, message: "Configuration Intigo enregistrée." };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Erreur enregistrement" };
  }
}

export async function deleteIntigoConfig(teamId: string) {
  try {
    await (prisma as any).intigoIntegration.delete({ where: { teamId } });
    return { success: true, message: "Configuration Intigo supprimée." };
  } catch { return { success: false, message: "Erreur lors de la suppression." }; }
}

export { INTIGO_DEFAULT_BASE_URL };
