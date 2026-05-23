import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { validatePayment as validatePaymentUtil, rejectPayment } from "@/lib/pdf-extractor";

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();
    const { action = "validate", revenueId, id } = body;
    const targetId = revenueId || id;

    if (!targetId) {
      return NextResponse.json({ error: "ID requis" }, { status: 400 });
    }

    if (action === "validate") {
      const result = await validatePaymentUtil(teamId, targetId);
      return NextResponse.json(result);
    }

    if (action === "reject") {
      const result = await rejectPayment(teamId, targetId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Action non reconnue" }, { status: 400 });
  } catch (err) {
    console.error("[Payment Validate] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
