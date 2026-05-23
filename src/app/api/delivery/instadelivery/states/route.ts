import { NextResponse } from "next/server";
import { getInstaDeliveryStateList } from "@/lib/instavia-delivery";

/**
 * GET /api/delivery/instadelivery/states
 */
export async function GET() {
  try {
    const states = await getInstaDeliveryStateList();
    return NextResponse.json({ success: true, states });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}
