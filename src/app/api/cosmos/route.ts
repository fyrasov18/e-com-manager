// src/app/api/cosmos/route.ts — Gestion de la configuration Cosmos Delivery (GET / POST).
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { getCosmosConfigSafe, saveCosmosConfig, deleteCosmosConfig } from "@/lib/cosmos-config";
import { testCosmosConnection } from "@/lib/cosmos-api";

export async function GET() {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const config = await getCosmosConfigSafe(teamId);
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: "Erreur chargement configuration Cosmos." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action === "save") {
      const res = await saveCosmosConfig(teamId, {
        apiToken: body.apiToken,
        baseUrl: body.baseUrl,
        isActive: body.isActive ?? true,
      });
      return NextResponse.json(res);
    }

    if (action === "delete") {
      const res = await deleteCosmosConfig(teamId);
      return NextResponse.json(res);
    }

    if (action === "test") {
      const res = await testCosmosConnection(teamId);
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: "Action non reconnue." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Erreur serveur Cosmos." }, { status: 500 });
  }
}
