import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getTeamId(): Promise<string | null> {
  const teams = await prisma.team.findMany({ take: 1 });
  return teams[0]?.id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const teamId = await getTeamId();
    if (!teamId) {
      return NextResponse.json({ settings: null });
    }

    let settings = await prisma.settings.findUnique({
      where: { teamId },
    });

    if (!settings) {
      settings = await prisma.settings.create({
        data: { teamId },
      });
    }

    const config = await prisma.instaDeliveryConfig.findFirst({
      where: { teamId, isActive: true },
    });

    return NextResponse.json({
      settings: {
        ...settings,
        hasInstaDelivery: !!config,
      },
    });
  } catch (err) {
    console.error("Get settings error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const teamId = await getTeamId();
    if (!teamId) {
      return NextResponse.json({ success: false, message: "Aucune équipe trouvée" }, { status: 400 });
    }

    const body = await req.json();
    const {
      platformName,
      defaultCurrency,
      defaultLanguage,
      stockSyncEnabled,
      stockRuleColisEnleve,
      stockRuleRetourLivre,
      stockRuleRetourPlanifie,
      paymentManualValidation,
      paymentValidatedOnlyRevenue,
      statusMapping,
      instaLogin,
      instaPassword,
      removeInstaDelivery,
    } = body;

    const settings = await prisma.settings.upsert({
      where: { teamId },
      update: {
        platformName,
        defaultCurrency,
        defaultLanguage,
        stockSyncEnabled,
        stockRuleColisEnleve,
        stockRuleRetourLivre,
        stockRuleRetourPlanifie,
        paymentManualValidation,
        paymentValidatedOnlyRevenue,
        statusMapping: typeof statusMapping === "string" ? JSON.parse(statusMapping) : statusMapping,
      },
      create: {
        teamId,
        platformName,
        defaultCurrency,
        defaultLanguage,
        stockSyncEnabled,
        stockRuleColisEnleve,
        stockRuleRetourLivre,
        stockRuleRetourPlanifie,
        paymentManualValidation,
        paymentValidatedOnlyRevenue,
        statusMapping: {},
      },
    });

    let message = "Paramètres enregistrés.";

    if (instaLogin && instaPassword) {
      const existing = await prisma.instaDeliveryConfig.findFirst({
        where: { teamId, name: "Default" },
      });

      if (existing) {
        await prisma.instaDeliveryConfig.update({
          where: { id: existing.id },
          data: { login: instaLogin, password: instaPassword, isActive: true },
        });
      } else {
        await prisma.instaDeliveryConfig.create({
          data: { teamId, login: instaLogin, password: instaPassword, isActive: true, name: "Default" },
        });
      }
      message += " InstaDelivery configuré.";
    }

    if (removeInstaDelivery) {
      await prisma.instaDeliveryConfig.deleteMany({ where: { teamId } }).catch(() => {});
      message += " InstaDelivery supprimé.";
    }

    return NextResponse.json({ success: true, message, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.error("Save settings error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}