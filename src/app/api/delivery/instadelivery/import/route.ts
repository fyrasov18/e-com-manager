import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { syncInstaDeliveryPayments } from "@/lib/instavia-delivery";

/**
 * POST /api/delivery/instadelivery/import
 * Import old orders by pasting code_barre / tracking numbers
 * Body: { trackingNumbers: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();
    const { trackingNumbers } = body;

    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return NextResponse.json(
        { success: false, error: "Aucun code barre fourni." },
        { status: 400 }
      );
    }

    // Clean and deduplicate
    const cleaned = [...new Set(
      trackingNumbers
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0)
    )];

    if (cleaned.length === 0) {
      return NextResponse.json(
        { success: false, error: "Aucun code barre valide." },
        { status: 400 }
      );
    }

    if (cleaned.length > 200) {
      return NextResponse.json(
        { success: false, error: "Maximum 200 codes barres par import." },
        { status: 400 }
      );
    }

    const result = await syncInstaDeliveryPayments(teamId, cleaned);

    return NextResponse.json({
      success: true,
      ...result,
      total: cleaned.length,
    });
  } catch (err) {
    console.error("[InstaDelivery] Import error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
