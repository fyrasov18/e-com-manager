import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { syncInstaDeliveryPayments } from "@/lib/instavia-delivery";

/**
 * POST /api/delivery/instadelivery/sync-tracking
 * Bulk sync tracking numbers from InstaDelivery
 * Body: { trackingNumbers: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();
    const { trackingNumbers } = body;

    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return NextResponse.json(
        { success: false, error: "trackingNumbers requis (array)" },
        { status: 400 }
      );
    }

    if (trackingNumbers.length > 100) {
      return NextResponse.json(
        { success: false, error: "Maximum 100 tracking numbers par requête" },
        { status: 400 }
      );
    }

    const result = await syncInstaDeliveryPayments(teamId, trackingNumbers);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("[InstaDelivery] Sync tracking error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
