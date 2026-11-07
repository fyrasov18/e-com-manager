// GET /api/intigo/labels?nid=12345S7
// Génère et redirige vers le bordereau officiel Intigo.
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { generateBordereau } from "@/lib/intigo-parcels";

export async function GET(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const { searchParams } = new URL(req.url);
    const nid = searchParams.get("nid") || searchParams.get("barcode") || "";

    if (!nid) {
      return NextResponse.json({ success: false, message: "Paramètre nid requis" }, { status: 400 });
    }

    const nids = nid.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await generateBordereau(teamId, nids);

    if (!res.ok || !res.data) {
      return new NextResponse(
        `<html><body style="font-family:sans-serif;padding:30px;text-align:center;">
          <h2>Bordereau Intigo indisponible</h2>
          <p style="color:#666;">${(res as any).message || "Impossible de générer le bordereau pour ce colis."}</p>
        </body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 404 }
      );
    }

    const targetUrl = (res.data as any).url || (res.data as any).bordereau_url || (res.data as any).link;
    if (targetUrl) {
      return NextResponse.redirect(targetUrl);
    }

    return NextResponse.json({ success: true, data: res.data });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
