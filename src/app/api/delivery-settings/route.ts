import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorizedResponse, forbiddenResponse, type CurrentUser } from "@/lib/api-auth";
import { permissionsHavePermission } from "@/lib/rbac";
import { getAuthenticatedWorkspaceId } from "@/lib/saas";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

export const SUPPORTED_PROVIDERS = [
  "COLISSIMO",
  "INSTADELIVERY",
  "INTIGO",
  "COSMOS",
] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(provider: string): provider is SupportedProvider {
  return SUPPORTED_PROVIDERS.includes(provider as SupportedProvider);
}

export interface DeliverySettingPayload {
  provider: string;
  deliveryCost: number;
  returnCost: number;
  withholdingTaxPercent?: number;
}

/**
 * Resolves the authenticated team ID server-side.
 * Strictly prevents any client override.
 */
export async function resolveActiveTeamId(user: CurrentUser): Promise<string> {
  if (user.teamId) return user.teamId;
  if (user.workspaceId) return user.workspaceId;
  const saasWorkspaceId = await getAuthenticatedWorkspaceId();
  if (saasWorkspaceId) return saasWorkspaceId;
  return getOrCreateDefaultTeamId();
}

/**
 * Ensures baseline delivery company settings exist for a specific team/workspace.
 * Missing providers are initialized independently with default costs.
 */
export async function ensureDefaultDeliverySettingsForTeam(teamId: string) {
  for (const provider of SUPPORTED_PROVIDERS) {
    await prisma.deliveryCompanySetting.upsert({
      where: {
        teamId_provider: {
          teamId,
          provider,
        },
      },
      update: {},
      create: {
        teamId,
        provider,
        deliveryCost: 8,
        returnCost: 3,
        withholdingTaxPercent: 0,
        isActive: true,
      },
    });
  }
}

/**
 * Retrieves delivery settings strictly scoped to a team/workspace.
 */
export async function getDeliverySettingsForTeam(teamId: string) {
  await ensureDefaultDeliverySettingsForTeam(teamId);

  return prisma.deliveryCompanySetting.findMany({
    where: {
      teamId,
      provider: { in: [...SUPPORTED_PROVIDERS] },
    },
    orderBy: {
      provider: "asc",
    },
  });
}

/**
 * Updates or creates a delivery setting for a specific team/workspace.
 */
export async function saveDeliverySettingForTeam(
  teamId: string,
  payload: DeliverySettingPayload
) {
  const provider = String(payload.provider ?? "").trim().toUpperCase();
  const deliveryCost = Number(payload.deliveryCost);
  const returnCost = Number(payload.returnCost);
  const withholdingTaxPercent = Number(payload.withholdingTaxPercent ?? 0);

  if (!provider || !isSupportedProvider(provider)) {
    throw new Error(
      `Société de livraison invalide. Valeurs acceptées: ${SUPPORTED_PROVIDERS.join(", ")}`
    );
  }

  if (
    Number.isNaN(deliveryCost) ||
    Number.isNaN(returnCost) ||
    Number.isNaN(withholdingTaxPercent)
  ) {
    throw new Error("Coûts invalides.");
  }

  if (deliveryCost < 0 || returnCost < 0 || withholdingTaxPercent < 0) {
    throw new Error("Les coûts ne peuvent pas être négatifs.");
  }

  if (withholdingTaxPercent > 100) {
    throw new Error("La retenue à la source ne peut pas dépasser 100%.");
  }

  return prisma.deliveryCompanySetting.upsert({
    where: {
      teamId_provider: {
        teamId,
        provider,
      },
    },
    update: {
      deliveryCost,
      returnCost,
      withholdingTaxPercent,
    },
    create: {
      teamId,
      provider,
      deliveryCost,
      returnCost,
      withholdingTaxPercent,
      isActive: true,
    },
  });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const canRead =
      permissionsHavePermission(user.permissions, "delivery:read") ||
      permissionsHavePermission(user.permissions, "settings:manage") ||
      permissionsHavePermission(user.permissions, "finance:read");

    if (!canRead) {
      return forbiddenResponse();
    }

    const teamId = await resolveActiveTeamId(user);
    if (!teamId) {
      return NextResponse.json(
        { success: false, message: "Workspace introuvable." },
        { status: 400 }
      );
    }

    const settings = await getDeliverySettingsForTeam(teamId);

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Erreur chargement paramètres livraison",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function handleSaveRequest(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorizedResponse();
    }

    const canWrite =
      permissionsHavePermission(user.permissions, "delivery:write") ||
      permissionsHavePermission(user.permissions, "settings:manage");

    if (!canWrite) {
      return forbiddenResponse();
    }

    const teamId = await resolveActiveTeamId(user);
    if (!teamId) {
      return NextResponse.json(
        { success: false, message: "Workspace introuvable." },
        { status: 400 }
      );
    }

    const body = await req.json();

    // Security check: Ignore any client-provided teamId to enforce isolation
    const setting = await saveDeliverySettingForTeam(teamId, {
      provider: body.provider,
      deliveryCost: body.deliveryCost,
      returnCost: body.returnCost,
      withholdingTaxPercent: body.withholdingTaxPercent,
    });

    return NextResponse.json({
      success: true,
      data: setting,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isValidationError =
      message.includes("invalide") ||
      message.includes("négatifs") ||
      message.includes("dépasser");

    return NextResponse.json(
      {
        success: false,
        message: message || "Erreur modification paramètres livraison",
      },
      { status: isValidationError ? 400 : 500 }
    );
  }
}

export async function PUT(req: Request) {
  return handleSaveRequest(req);
}

export async function POST(req: Request) {
  return handleSaveRequest(req);
}
