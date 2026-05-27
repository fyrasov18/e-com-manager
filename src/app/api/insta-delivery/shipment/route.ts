import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import {
  createInstaDeliveryParcel,
  trackInstaDeliveryParcel,
  getInstaDeliveryConfig,
  getInstaDeliveryModaliteList,
  getInstaDeliveryPostalCodes,
  getInstaDeliveryStateList,
} from "@/lib/instavia-delivery";

async function getTeamId(): Promise<string | null> {
  return getOrCreateDefaultTeamId();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  const teamId = await getTeamId();
  if (!teamId) {
    return NextResponse.json({ error: "Aucune équipe trouvée" }, { status: 400 });
  }

  try {
    if (action === "track") {
      const reference = searchParams.get("reference");
      if (!reference) {
        return NextResponse.json({ error: "Référence requise" }, { status: 400 });
      }
      const config = await getInstaDeliveryConfig(teamId);
      if (!config) {
        return NextResponse.json({ success: false, error: "InstaDelivery non configuré" }, { status: 400 });
      }
      const result = await trackInstaDeliveryParcel(reference, config.id);
      return NextResponse.json(result);
    }

    if (action === "modalites") {
      const result = await getInstaDeliveryModaliteList();
      return NextResponse.json(result);
    }

    if (action === "postalCodes") {
      const result = await getInstaDeliveryPostalCodes();
      return NextResponse.json(result);
    }

    if (action === "states") {
      const result = await getInstaDeliveryStateList();
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (err) {
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
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ success: false, message: "orderId requis" }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, teamId },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: "Commande non trouvée" }, { status: 404 });
    }

    const missingFields = [
      order.customerName ? null : "nom",
      order.customerPhone ? null : "tel",
      order.shippingAddress ? null : "adresse",
    ].filter(Boolean) as string[];

    if (missingFields.length > 0) {
      const reason = `Informations client incomplètes : ${missingFields.join(", ")}`;
      return NextResponse.json({
        success: false,
        message: reason,
        missingFields,
      }, { status: 400 });
    }

    const result = await createInstaDeliveryParcel(teamId, {
      reference: `ORD-${order.id.slice(0, 8)}`,
      designation: "Colis commande",
      montant_reception: order.revenue.toString(),
      modalite: "0",
      code: order.shippingZip ?? "1000",
      tel: order.customerPhone ?? "",
      adresse: order.shippingAddress ?? "",
      nom: order.customerName ?? "",
      nombre_piece: 1,
    });

    if (result.success && result.code_barre) {
      await prisma.order.update({
        where: { id: orderId },
        data: { 
          trackingNumber: result.code_barre,
          shippingProvider: "INSTAVIA_DELIVERY"
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ 
      success: false, 
      message: err instanceof Error ? err.message : "Erreur serveur" 
    }, { status: 500 });
  }
}
