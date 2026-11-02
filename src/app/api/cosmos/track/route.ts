// src/app/api/cosmos/track/route.ts — Suivi public d'un colis Cosmos Delivery (sans auth).
import { NextRequest, NextResponse } from "next/server";
import { trackCosmosPublic } from "@/lib/cosmos-api";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");

    if (!search || !search.trim()) {
      return NextResponse.json(
        { success: false, message: "Paramètre search requis (code barre ou téléphone)" },
        { status: 400 }
      );
    }

    const res = await trackCosmosPublic(search.trim());
    if (!res.ok) {
      return NextResponse.json(
        { success: false, message: res.message },
        { status: res.httpStatus || 400 }
      );
    }

    return NextResponse.json(res.data);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || "Erreur serveur" }, { status: 500 });
  }
}
