import { NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { getDeliveryRevenueStats } from "@/lib/delivery-revenue";
import { getInstaDeliveryConfig } from "@/lib/instavia-delivery";

export async function POST() {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    
    const config = await getInstaDeliveryConfig(teamId);
    if (!config) {
      return NextResponse.json({
        error: "Veuillez configurer l'API InstaDelivery avant de consulter les revenus.",
        configured: false,
      }, { status: 401 });
    }

    const revenue = await getDeliveryRevenueStats(teamId);
    
    if (!revenue) {
      return NextResponse.json({
        message: "Synchronisation terminee. Aucune donnee disponible.",
        configured: true,
      });
    }

    return NextResponse.json({
      message: "Revenus livraison synchronises.",
      configured: true,
      revenue,
    });
  } catch (err) {
    console.error("[DeliveryRevenue] Refresh error:", err);
    return NextResponse.json({
      error: "Erreur lors de la synchronisation.",
    }, { status: 500 });
  }
}