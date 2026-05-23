import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_PROVIDERS = ["COLISSIMO", "INSTADELIVERY"];

export async function GET() {
  try {
    for (const provider of DEFAULT_PROVIDERS) {
      await prisma.deliveryCompanySetting.upsert({
        where: { provider },
        update: {},
        create: {
          provider,
          deliveryCost: 8,
          returnCost: 3,
          withholdingTaxPercent: 0,
        },
      });
    }

    const settings = await prisma.deliveryCompanySetting.findMany({
      where: {
        provider: { in: DEFAULT_PROVIDERS },
      },
      orderBy: {
        provider: "asc",
      },
    });

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

async function saveDeliverySetting(req: Request) {
  try {
    const body = await req.json();

    const provider = String(body.provider ?? "").trim();
    const deliveryCost = Number(body.deliveryCost);
    const returnCost = Number(body.returnCost);
    const withholdingTaxPercent = Number(body.withholdingTaxPercent ?? 0);

    if (!provider) {
      return NextResponse.json(
        { success: false, message: "Société livraison obligatoire" },
        { status: 400 }
      );
    }

    if (
      Number.isNaN(deliveryCost) ||
      Number.isNaN(returnCost) ||
      Number.isNaN(withholdingTaxPercent)
    ) {
      return NextResponse.json(
        { success: false, message: "Coûts invalides" },
        { status: 400 }
      );
    }

    if (deliveryCost < 0 || returnCost < 0 || withholdingTaxPercent < 0) {
      return NextResponse.json(
        { success: false, message: "Les couts ne peuvent pas etre negatifs" },
        { status: 400 }
      );
    }

    if (withholdingTaxPercent > 100) {
      return NextResponse.json(
        { success: false, message: "La retenue a la source ne peut pas depasser 100%" },
        { status: 400 }
      );
    }

    const setting = await prisma.deliveryCompanySetting.upsert({
      where: { provider },
      update: {
        deliveryCost,
        returnCost,
        withholdingTaxPercent,
      },
      create: {
        provider,
        deliveryCost,
        returnCost,
        withholdingTaxPercent,
      },
    });

    return NextResponse.json({
      success: true,
      data: setting,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Erreur modification paramètres livraison",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  return saveDeliverySetting(req);
}

export async function POST(req: Request) {
  return saveDeliverySetting(req);
}
