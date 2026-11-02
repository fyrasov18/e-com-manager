// src/lib/cosmos-config.ts — Résolution de la configuration Cosmos Delivery (serveur uniquement).
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, maskApiToken } from "@/lib/cosmos-crypto";

export const COSMOS_DEFAULT_BASE_URL = "https://api.cosmos.tn/api/v1";

export function cosmosBaseUrlFromEnv(): string {
  return (process.env.COSMOS_API_BASE_URL || COSMOS_DEFAULT_BASE_URL).replace(/\/$/, "");
}

export type ResolvedCosmosConfig = {
  baseUrl: string;
  apiToken: string;
  source: "db" | "env";
  teamId: string;
};

export async function getCosmosDbRow(teamId: string) {
  try {
    return await (prisma as any).cosmosIntegration.findUnique({ where: { teamId } });
  } catch {
    return null;
  }
}

export async function resolveCosmosConfig(teamId: string): Promise<ResolvedCosmosConfig | null> {
  const row = await getCosmosDbRow(teamId);
  if (row && row.isActive) {
    try {
      const token = decryptSecret(row.apiTokenEncrypted).trim();
      if (token) {
        return {
          baseUrl: (row.baseUrl || cosmosBaseUrlFromEnv()).replace(/\/$/, ""),
          apiToken: token,
          source: "db",
          teamId,
        };
      }
    } catch (e) {
      console.error("[Cosmos] decrypt failed:", e);
    }
  }

  const envToken = (process.env.COSMOS_API_TOKEN || "").trim();
  if (envToken) {
    return {
      baseUrl: cosmosBaseUrlFromEnv(),
      apiToken: envToken,
      source: "env",
      teamId,
    };
  }

  return null;
}

export async function getCosmosConfigSafe(teamId: string) {
  const row = await getCosmosDbRow(teamId);
  const resolved = await resolveCosmosConfig(teamId);

  if (!resolved) {
    return {
      configured: false,
      source: "none",
      baseUrl: cosmosBaseUrlFromEnv(),
      isActive: false,
      maskedToken: "—",
      lastTested: null,
      lastError: row?.lastError ?? null,
      lastSyncAt: null,
    };
  }

  return {
    configured: true,
    source: resolved.source,
    baseUrl: resolved.baseUrl,
    isActive: row?.isActive ?? true,
    maskedToken: maskApiToken(resolved.apiToken),
    lastTested: row?.lastTested ? row.lastTested.toISOString() : null,
    lastError: row?.lastError ?? null,
    lastSyncAt: row?.lastSyncAt ? row.lastSyncAt.toISOString() : null,
  };
}

export async function saveCosmosConfig(teamId: string, input: { apiToken?: string; baseUrl?: string; isActive?: boolean }) {
  try {
    const existing = await getCosmosDbRow(teamId);
    let encrypted = existing?.apiTokenEncrypted ?? "";

    if (typeof input.apiToken === "string" && input.apiToken.trim()) {
      encrypted = encryptSecret(input.apiToken.trim());
    }

    if (!encrypted) {
      const envToken = (process.env.COSMOS_API_TOKEN || "").trim();
      if (!envToken) {
        return { success: false, message: "Token API Bearer Cosmos requis." };
      }
      try {
        encrypted = encryptSecret(envToken);
      } catch {
        return { success: false, message: "Chiffrement impossible: configurez COSMOS_SECRET_KEY." };
      }
    }

    const data = {
      apiTokenEncrypted: encrypted,
      baseUrl: (input.baseUrl?.trim?.() || existing?.baseUrl || cosmosBaseUrlFromEnv()).replace(/\/$/, ""),
      isActive: input.isActive ?? existing?.isActive ?? true,
      lastError: null,
    };

    await (prisma as any).cosmosIntegration.upsert({
      where: { teamId },
      update: data,
      create: { teamId, ...data },
    });

    return { success: true, message: "Configuration Cosmos Delivery enregistrée avec succès." };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Erreur enregistrement" };
  }
}

export async function deleteCosmosConfig(teamId: string) {
  try {
    await (prisma as any).cosmosIntegration.deleteMany({ where: { teamId } });
    return { success: true, message: "Configuration Cosmos Delivery supprimée." };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Erreur suppression" };
  }
}
