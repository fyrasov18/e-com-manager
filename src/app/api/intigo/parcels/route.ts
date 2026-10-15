import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { getParcel, getParcelHistory, listParcels, patchParcel, parcelAction, createExchange } from "@/lib/intigo-parcels";

export async function GET(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const { searchParams } = new URL(req.url);
    const nid = searchParams.get("nid")?.trim();
    if (nid && searchParams.get("history") === "1") return NextResponse.json(await getParcelHistory(teamId, nid));
    if (nid) return NextResponse.json(await getParcel(teamId, nid));
    const q: Record<string, string> = {};
    for (const k of ["page", "limit", "search", "status", "from", "to"]) {
      const v = searchParams.get(k);
      if (v) q[k] = v;
    }
    return NextResponse.json(await listParcels(teamId, q));
  } catch { return NextResponse.json({ ok: false, message: "Erreur serveur." }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json().catch(() => ({}));
    const { nid, action } = body;
    if (!nid) return NextResponse.json({ ok: false, message: "nid requis." }, { status: 400 });
    if (action === "exchange") return NextResponse.json(await createExchange(teamId, body.payload || {}));
    if (!action) return NextResponse.json({ ok: false, message: "action requise." }, { status: 400 });
    const { nid: _n, action: _a, ...rest } = body;
    return NextResponse.json(await parcelAction(teamId, String(nid), String(action), rest));
  } catch { return NextResponse.json({ ok: false, message: "Erreur serveur." }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json().catch(() => ({}));
    const { nid, patch } = body;
    if (!nid || !patch) return NextResponse.json({ ok: false, message: "nid et patch requis." }, { status: 400 });
    return NextResponse.json(await patchParcel(teamId, String(nid), patch));
  } catch { return NextResponse.json({ ok: false, message: "Erreur serveur." }, { status: 500 }); }
}
