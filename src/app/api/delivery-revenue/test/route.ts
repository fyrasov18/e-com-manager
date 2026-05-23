import { NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { getInstaDeliveryConfig, testInstaDeliveryConnection } from "@/lib/instavia-delivery";

export async function POST() {
  try {
    const teamId = await getOrCreateDefaultTeamId();

    const config = await getInstaDeliveryConfig(teamId);
    if (!config) {
      return NextResponse.json({
        success: false,
        message: "Aucune configuration InstaDelivery trouvée.",
        configured: false,
        checks: {
          login: false,
          connection: false,
          stateList: false,
          modaliteList: false,
          codePostal: false,
        },
      });
    }

    const results = {
      success: false,
      message: "",
      configured: true,
      checks: {
        login: !!config.login,
        connection: false,
        stateList: false,
        modaliteList: false,
        codePostal: false,
      },
    };

    const connectionTest = await testInstaDeliveryConnection(config.id);
    results.checks.connection = connectionTest.success;
    results.message = connectionTest.message;

    if (connectionTest.success) {
      results.checks.stateList = true;
      results.checks.modaliteList = true;
      results.checks.codePostal = true;
      results.success = true;
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error("[DeliveryRevenue] Test error:", err);
    return NextResponse.json({
      success: false,
      message: "Erreur lors du diagnostic.",
      error: err instanceof Error ? err.message : "Erreur inconnue",
    });
  }
}
