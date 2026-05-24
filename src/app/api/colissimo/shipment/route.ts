import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import {
  ajouterColis,
  AjouterMultipleColis,
  getColis,
  syncColisStatus,
  supprimerColis,
  modifierColis,
  ColissimoColisPayload,
} from "@/lib/colissimo";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await request.json();
    const { action, orderId, orders, codeBar, updates } = body;

    if (action === "create") {
      if (!orderId) {
        return NextResponse.json({ error: "ID commande requis." }, { status: 400 });
      }

      const order = await prisma.order.findFirst({
        where: { id: orderId, teamId },
      });

      if (!order) {
        return NextResponse.json({ error: "Commande non trouv." }, { status: 404 });
      }

      const result = await ajouterColis(teamId, {
        reference: order.trackingNumber || order.id.slice(0, 8),
        client: order.customerName || "Client",
        adresse: order.shippingAddress || "",
        code_postal: order.shippingZip || "",
        nb_pieces: order.quantity || 1,
        prix: order.revenue || 0,
        tel1: order.customerPhone || "",
        tel2: "",
        designation: "Colis",
        commentaire: "",
        type: "VO",
        echange: 0,
      });

      if (result.success && result.codeBar) {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            trackingNumber: result.codeBar,
            shippingProvider: "COLISSIMO_TN",
          },
        });
      }

      return NextResponse.json(result);
    }

    if (action === "createMultiple") {
      if (!orders || !Array.isArray(orders)) {
        return NextResponse.json({ error: "Liste de commandes requise." }, { status: 400 });
      }

      const results: Array<{ orderId: string; colis: ColissimoColisPayload }> = await Promise.all(
        orders.map(async (oId: string) => {
          const order = await prisma.order.findFirst({
            where: { id: oId, teamId },
          });

          if (!order) return { orderId: oId, colis: null as never };

          return {
            orderId: oId,
            colis: {
              reference: order.trackingNumber || order.id.slice(0, 8),
              client: order.customerName || "Client",
              adresse: order.shippingAddress || "",
              code_postal: order.shippingZip || "",
              nb_pieces: order.quantity || 1,
              prix: order.revenue || 0,
              tel1: order.customerPhone || "",
              tel2: "",
              designation: "Colis",
              commentaire: "",
              type: "VO" as const,
              echange: 0 as const,
            },
          };
        })
      );

      const validColis = results
        .filter((r): r is { orderId: string; colis: ColissimoColisPayload } => r.colis !== null)
        .map((r) => r.colis);

      if (validColis.length === 0) {
        return NextResponse.json({ error: "Aucune commande valide." }, { status: 400 });
      }

      const result = await AjouterMultipleColis(teamId, validColis);

      if (result.success) {
        const orderIds = results
          .filter((r): r is { orderId: string; colis: ColissimoColisPayload } => r.colis !== null)
          .map((r) => r.orderId);

        for (let i = 0; i < validColis.length && i < orderIds.length; i++) {
          if (result.successCount && i < result.successCount) {
            await prisma.order.update({
              where: { id: orderIds[i] },
              data: {
                shippingProvider: "COLISSIMO_TN",
              },
            });
          }
        }
      }

      return NextResponse.json(result);
    }

    if (action === "track") {
      if (!codeBar) {
        return NextResponse.json({ error: "CodeBar requis." }, { status: 400 });
      }

      return NextResponse.json(await getColis(teamId, codeBar));
    }

    if (action === "syncAll") {
      const allOrders = await prisma.order.findMany({
        where: {
          teamId,
          shippingProvider: "COLISSIMO_TN",
          trackingNumber: { not: null },
        },
        select: { id: true, trackingNumber: true },
      });

      const validOrders = allOrders
        .filter((o: { id: string; trackingNumber: string | null }): o is { id: string; trackingNumber: string } => o.trackingNumber !== null)
        .map((o) => ({ id: o.id, trackingNumber: o.trackingNumber }));

      return NextResponse.json(await syncColisStatus(teamId, validOrders));
    }

    if (action === "syncOne") {
      if (!orderId) {
        return NextResponse.json({ error: "ID commande requis." }, { status: 400 });
      }

      const order = await prisma.order.findFirst({
        where: { id: orderId, teamId },
      });

      if (!order || !order.trackingNumber) {
        return NextResponse.json({ error: "Commande ou tracking non trouv." }, { status: 404 });
      }

      return NextResponse.json(await getColis(teamId, order.trackingNumber));
    }

    if (action === "delete") {
      if (!codeBar) {
        return NextResponse.json({ error: "CodeBar requis." }, { status: 400 });
      }

      return NextResponse.json(await supprimerColis(teamId, codeBar));
    }

    if (action === "update") {
      if (!codeBar || !updates) {
        return NextResponse.json({ error: "CodeBar et modifications requis." }, { status: 400 });
      }

      return NextResponse.json(await modifierColis(teamId, codeBar, updates));
    }

    return NextResponse.json({ error: "Action non reconnue." }, { status: 400 });
  } catch (err) {
    console.error("[Colissimo] Shipment error:", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
