import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getInstaDeliveryConfigs,
  getInstaDeliveryConfigById,
  saveInstaDeliveryConfig,
  deleteInstaDeliveryConfig,
  testInstaDeliveryConnection,
} from "@/lib/instavia-delivery";

export async function GET() {
  try {
    const teams = await prisma.team.findMany({ take: 1 });
    if (teams.length === 0) {
      return NextResponse.json({ configs: [], message: "Aucune équipe trouvée" });
    }
    const teamId = teams[0].id;
    const configs = await getInstaDeliveryConfigs(teamId);

    return NextResponse.json({
      configs: configs.map(c => ({
        id: c.id,
        name: c.name,
        carrier: c.carrier,
        deliveryType: c.deliveryType,
        trackingEnabled: c.trackingEnabled,
        webhookEnabled: c.webhookEnabled,
        labelCreationEnabled: c.labelCreationEnabled,
        isActive: c.isActive,
        lastTested: c.lastTested?.toISOString() ?? null,
        lastError: c.lastError ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.error("InstaDelivery GET error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { login, password, action, configId, name, carrier, deliveryType, trackingEnabled, webhookEnabled, labelCreationEnabled } = body;

    const teams = await prisma.team.findMany({ take: 1 });
    if (teams.length === 0) {
      return NextResponse.json({ success: false, message: "Aucune équipe trouvée" }, { status: 400 });
    }
    const teamId = teams[0].id;

    if (action === "save") {
      if (!login || !password) {
        return NextResponse.json({ success: false, message: "Login et password requis" }, { status: 400 });
      }
      return NextResponse.json(await saveInstaDeliveryConfig(
        teamId,
        login,
        password,
        name || "Default",
        carrier || "INSTADELIVERY",
        deliveryType || "standard",
        trackingEnabled ?? true,
        webhookEnabled ?? true,
        labelCreationEnabled ?? true
      ));
    }

    if (action === "delete") {
      if (!configId) {
        return NextResponse.json({ success: false, message: "configId requis" }, { status: 400 });
      }
      return NextResponse.json(await deleteInstaDeliveryConfig(configId));
    }

    if (action === "test") {
      if (!configId) {
        return NextResponse.json({ success: false, message: "configId requis" }, { status: 400 });
      }
      return NextResponse.json(await testInstaDeliveryConnection(configId));
    }

    return NextResponse.json({ success: false, message: "Action inconnue" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.error("InstaDelivery POST error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
