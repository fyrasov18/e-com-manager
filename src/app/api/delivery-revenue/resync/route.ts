import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { resyncDeliveryRevenue } from "@/lib/delivery-revenue";

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();
    const { revenueId, id } = body;
    const targetId = revenueId || id;

    if (!targetId) {
      return NextResponse.json({ success: false, message: "id requis" }, { status: 400 });
    }

    const result = await resyncDeliveryRevenue(teamId, targetId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
