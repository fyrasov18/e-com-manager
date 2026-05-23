import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { prisma } from "@/lib/prisma";
import { getInstaDeliveryConfig, trackInstaDeliveryParcel } from "@/lib/instavia-delivery";
import { getColissimoConfig, getColisDetails } from "@/lib/colissimo";
import { parseOperationDate } from "@/lib/date-utils";

/**
 * POST /api/orders/backfill-dates
 *
 * Retroactivement remplit operationDate pour toutes les commandes
 * qui ont ce champ vide, en reinterrogeant l'API de livraison.
 *
 * Body (optionnel):
 *   { provider?: "INSTADELIVERY" | "COLISSIMO" | "ALL", limit?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json().catch(() => ({}));
    const provider: string = body?.provider ?? "ALL";
    const limit = Math.min(Number(body?.limit) || 200, 500);

    const where: any = {
      teamId,
      operationDate: null,
      trackingNumber: { not: null },
    };

    if (provider !== "ALL") {
      where.shippingProvider = { contains: provider === "INSTADELIVERY" ? "INSTA" : "COLISSIMO", mode: "insensitive" };
    }

    const orders = await prisma.order.findMany({
      where,
      select: { id: true, trackingNumber: true, shippingProvider: true, deliveredAt: true, pickedUpAt: true },
      take: limit,
    });

    const stats = { processed: 0, updated: 0, failed: 0, skipped: 0 };
    const errors: string[] = [];

    const instaConfig = await getInstaDeliveryConfig(teamId).catch(() => null);
    const colissimoConfig = await getColissimoConfig(teamId).catch(() => null);

    for (const order of orders) {
      stats.processed++;
      const tracking = order.trackingNumber!;
      const prov = (order.shippingProvider ?? "").toUpperCase();

      try {
        let opDate: Date | null = null;

        if (prov.includes("INSTA")) {
          if (!instaConfig) { stats.skipped++; continue; }
          const r = await trackInstaDeliveryParcel(tracking, instaConfig.id);
          if (r.success && r.colis) {
            opDate = parseOperationDate(r.colis.last_operation_date);
          }
        } else if (prov.includes("COLISSIMO")) {
          if (!colissimoConfig) { stats.skipped++; continue; }
          const r = await getColisDetails(teamId, tracking);
          if (r.success && r.details) {
            opDate =
              parseOperationDate(r.details.dateLivraison) ||
              parseOperationDate(r.details.dateEnlevement) ||
              null;
          }
        } else {
          stats.skipped++;
          continue;
        }

        if (opDate) {
          await prisma.order.update({
            where: { id: order.id },
            data: { operationDate: opDate },
          });
          stats.updated++;
        } else {
          stats.skipped++;
        }
      } catch (err) {
        stats.failed++;
        errors.push(`${tracking}: ${err instanceof Error ? err.message : "Erreur"}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Backfill terminé — ${stats.updated} dates remplies sur ${stats.processed} commandes`,
      ...stats,
      errors: errors.slice(0, 20),
    });
  } catch (err) {
    console.error("[backfill-dates] Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/orders/backfill-dates
 * Retourne le nombre de commandes sans operationDate (par prestataire)
 */
export async function GET(_req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();

    const [totalInsta, missingInsta, totalColissimo, missingColissimo] = await Promise.all([
      prisma.order.count({ where: { teamId, shippingProvider: { contains: "INSTA", mode: "insensitive" } } }),
      prisma.order.count({ where: { teamId, shippingProvider: { contains: "INSTA", mode: "insensitive" }, operationDate: null } }),
      prisma.order.count({ where: { teamId, shippingProvider: { contains: "COLISSIMO", mode: "insensitive" } } }),
      prisma.order.count({ where: { teamId, shippingProvider: { contains: "COLISSIMO", mode: "insensitive" }, operationDate: null } }),
    ]);

    return NextResponse.json({
      success: true,
      instadelivery: { total: totalInsta, missingOperationDate: missingInsta },
      colissimo: { total: totalColissimo, missingOperationDate: missingColissimo },
      totalMissing: missingInsta + missingColissimo,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
