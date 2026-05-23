import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { deleteInstaDeliveryParcel } from "@/lib/instavia-delivery";

/**
 * DELETE /api/delivery/instadelivery/delete
 * Delete a parcel from InstaDelivery
 * Body: { barcode: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();
    const { barcode } = body;

    if (!barcode?.trim()) {
      return NextResponse.json(
        { success: false, message: "Code barre requis" },
        { status: 400 }
      );
    }

    const result = await deleteInstaDeliveryParcel(teamId, barcode.trim());

    return NextResponse.json(result);
  } catch (err) {
    console.error("[InstaDelivery] Delete error:", err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
