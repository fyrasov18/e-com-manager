import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import {
  getColissimoConfig,
  saveColissimoConfig,
  deleteColissimoConfig,
  testColissimoConnection,
  ajouterColis,
  AjouterMultipleColis,
  getColis,
  syncColisStatus,
  ListVilles,
  supprimerColis,
  modifierColis,
  demanderEnlevement,
} from "@/lib/colissimo";

export async function GET() {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const config = await getColissimoConfig(teamId);

    if (!config) {
      return NextResponse.json({ configured: false });
    }

    return NextResponse.json({
      configured: true,
      config: {
        utilisateur: config.utilisateur,
        isActive: config.isActive,
        lastTested: config.lastTested,
        lastSyncAt: config.lastSyncAt,
        lastError: config.lastError,
      },
    });
  } catch (err) {
    console.error("[Colissimo] GET error:", err);
    return NextResponse.json({ error: "Erreur lors du chargement." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await request.json();
    const { action, utilisateur, motPasse } = body;

    if (action === "save") {
      const existing = await getColissimoConfig(teamId);
      const nextMotPasse = typeof motPasse === "string" && motPasse.trim()
        ? motPasse
        : existing?.motPasse;

      if (!utilisateur || !nextMotPasse) {
        return NextResponse.json({ error: "Identifiants requis." }, { status: 400 });
      }
      return NextResponse.json(await saveColissimoConfig(teamId, utilisateur, nextMotPasse));
    }

    if (action === "delete") {
      return NextResponse.json(await deleteColissimoConfig(teamId));
    }

    if (action === "test") {
      return NextResponse.json(await testColissimoConnection(teamId));
    }

    if (action === "listVilles") {
      return NextResponse.json(await ListVilles(teamId));
    }

    if (action === "enlevement") {
      return NextResponse.json(await demanderEnlevement(teamId));
    }

    return NextResponse.json({ error: "Action non reconnue." }, { status: 400 });
  } catch (err) {
    console.error("[Colissimo] POST error:", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
