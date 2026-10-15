import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { getIntigoConfigSafe, saveIntigoConfig, deleteIntigoConfig } from "@/lib/intigo-config";
import { testConnection } from "@/lib/intigo-parcels";

export async function GET() {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const config = await getIntigoConfigSafe(teamId);
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: "Erreur chargement Intigo." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await request.json().catch(() => ({}));
    const { action } = body;
    if (action === "save") {
      const pick = body.defaultPickupIndex;
      const parsedPick =
        pick === null || pick === undefined || String(pick) === ""
          ? null
          : Number.isInteger(Number(pick)) ? Number(pick) : null;
      if (pick !== undefined && pick !== null && String(pick) !== "" && parsedPick === null) {
        return NextResponse.json({ success: false, message: "pickup_index invalide." }, { status: 400 });
      }
      return NextResponse.json(
        await saveIntigoConfig(teamId, {
          apiKey: body.apiKey,
          baseUrl: body.baseUrl,
          platform: body.platform,
          platformVersion: body.platformVersion,
          shopUrl: body.shopUrl,
          defaultPickupIndex: parsedPick,
          isActive: body.isActive ?? true,
        })
      );
    }
    if (action === "delete") return NextResponse.json(await deleteIntigoConfig(teamId));
    if (action === "test") return NextResponse.json(await testConnection(teamId));
    return NextResponse.json({ error: "Action non reconnue." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
