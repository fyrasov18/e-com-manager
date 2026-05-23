import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import {
  getInstaDeliveryConfig,
  syncInstaDeliveryTracking,
  syncAllInstaDeliveryRevenue,
  type InstaSyncResult,
} from "@/lib/instavia-delivery";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/delivery/instadelivery/sync-orders
 *
 * Syncs ALL InstaDelivery orders stored in the DB with the live API.
 * Updates Order records with:
 *   - operationDate (last_operation_date from API)
 *   - apiStatus / status
 *   - deliveredAt / pickedUpAt
 *   - customerName, customerPhone, shippingAddress
 *   - revenue (montant_reception)
 *   - paymentNumber
 *
 * Also creates orders from DeliveryRevenue entries that don't yet have
 * a matching Order row.
 *
 * Body (optional): { limit?: number }  — max orders to process (default 500)
 */
export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit) || 500, 1000);

    const config = await getInstaDeliveryConfig(teamId);
    if (!config) {
      return NextResponse.json(
        { success: false, error: "Aucune configuration InstaDelivery active." },
        { status: 400 }
      );
    }

    // ── Collect all unique tracking numbers ────────────────────────────────
    const [orderRows, revenueRows] = await Promise.all([
      prisma.order.findMany({
        where: {
          teamId,
          shippingProvider: { contains: "INSTA", mode: "insensitive" },
          trackingNumber: { not: null },
        },
        select: { trackingNumber: true },
        take: limit,
      }),
      prisma.deliveryRevenue.findMany({
        where: {
          teamId,
          provider: "INSTADELIVERY",
          trackingNumber: { not: null },
        },
        select: { trackingNumber: true },
        take: limit,
      }),
    ]);

    const allTracking = new Set<string>();
    for (const r of orderRows) if (r.trackingNumber) allTracking.add(r.trackingNumber.trim());
    for (const r of revenueRows) if (r.trackingNumber) allTracking.add(r.trackingNumber.trim());

    if (allTracking.size === 0) {
      return NextResponse.json({
        success: true,
        message: "Aucun tracking InstaDelivery trouvé en base.",
        imported: 0,
        updated: 0,
        errors: [],
      });
    }

    const result: InstaSyncResult = { imported: 0, updated: 0, ignored: 0, errors: [] };

    for (const tracking of allTracking) {
      try {
        const r = await syncInstaDeliveryTracking(config.id, tracking);
        if (r.action === "created") result.imported++;
        else if (r.action === "updated") result.updated++;
        else if (r.action === "ignored") result.ignored++;
        else result.errors.push(r.message);
      } catch (err) {
        result.errors.push(`${tracking}: ${err instanceof Error ? err.message : "Erreur"}`);
      }
    }

    // Also sync revenue table
    try {
      const revSync = await syncAllInstaDeliveryRevenue(teamId);
      result.imported += revSync.imported;
      result.updated += revSync.updated;
      result.errors.push(...revSync.errors);
    } catch (e) {
      result.errors.push(`Revenue sync: ${e instanceof Error ? e.message : "Erreur"}`);
    }

    return NextResponse.json({
      success: true,
      total: allTracking.size,
      imported: result.imported,
      updated: result.updated,
      ignored: result.ignored,
      errors: result.errors.slice(0, 20),
      message: `Sync terminé — ${result.imported} créés, ${result.updated} mis à jour, ${result.errors.length} erreurs`,
    });
  } catch (err) {
    console.error("[InstaDelivery] sync-orders error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/delivery/instadelivery/sync-orders
 * Returns a summary of InstaDelivery orders in DB (counts by status, missing operationDate, etc.)
 */
export async function GET(_req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();

    const [total, missingOpDate, byStatus] = await Promise.all([
      prisma.order.count({
        where: { teamId, shippingProvider: { contains: "INSTA", mode: "insensitive" } },
      }),
      prisma.order.count({
        where: {
          teamId,
          shippingProvider: { contains: "INSTA", mode: "insensitive" },
          operationDate: null,
        },
      }),
      prisma.order.groupBy({
        by: ["status"],
        where: { teamId, shippingProvider: { contains: "INSTA", mode: "insensitive" } },
        _count: { status: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      total,
      missingOperationDate: missingOpDate,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.status })),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
