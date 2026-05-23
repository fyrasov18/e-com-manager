import { NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { getDeliveryRevenueStats, syncColissimoRevenue, getActiveProviders } from "@/lib/delivery-revenue";
import { syncAllInstaDeliveryRevenue } from "@/lib/instavia-delivery";

export async function POST() {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const providers = await getActiveProviders(teamId);
    
    if (!providers.instaDelivery && !providers.colissimo) {
      return NextResponse.json({
        success: false,
        error: "Aucune intégration de livraison configurée.",
      });
    }

    const results: Record<string, any> = {};

    if (providers.colissimo) {
      console.log("[DeliveryRevenue] Syncing Colissimo...");
      const colissimoResult = await syncColissimoRevenue(teamId);
      results.colissimo = colissimoResult;
    }

    if (providers.instaDelivery) {
      console.log("[DeliveryRevenue] Syncing InstaDelivery...");
      const instaResult = await syncAllInstaDeliveryRevenue(teamId);
      results.instaDelivery = instaResult;
    }

    const stats = await getDeliveryRevenueStats(teamId);

    return NextResponse.json({
      success: true,
      results,
      stats,
    });
  } catch (err) {
    console.error("[DeliveryRevenue] Sync error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Erreur lors de la synchronisation.",
    });
  }
}