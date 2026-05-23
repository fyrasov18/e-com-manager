import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { syncDeliveryCompanies, getSyncStatus } from "@/lib/sync-delivery";

// POST /api/delivery/sync — déclenche la sync de tous les providers actifs
export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json().catch(() => ({}));
    const { provider } = body; // optional: "COLISSIMO" | "INSTADELIVERY"

    const status = getSyncStatus();
    if (status.isSyncing) {
      return NextResponse.json({ success: false, message: "Synchronisation déjà en cours." }, { status: 429 });
    }

    const result = await syncDeliveryCompanies(teamId);

    return NextResponse.json({
      success: true,
      message: `Sync terminée en ${result.duration}ms — ${result.totalOrders} commandes, ${result.totalPayments} paiements`,
      result,
    });
  } catch (err) {
    console.error("[POST /api/delivery/sync]", err);
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "Erreur serveur" }, { status: 500 });
  }
}

// GET /api/delivery/sync — retourne le statut de la sync
export async function GET() {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const status = getSyncStatus();

    // Last 10 logs
    const logs = await (async () => {
      try {
        const { prisma } = await import("@/lib/prisma");
        return await prisma.deliverySyncLog.findMany({
          where: { teamId },
          orderBy: { startedAt: "desc" },
          take: 10,
        });
      } catch { return []; }
    })();

    return NextResponse.json({ ...status, logs });
  } catch (err) {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
