import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import {
  getParcel,
  getParcelHistory,
  listParcels,
  patchParcel,
  parcelAction,
  createExchange,
  createParcelByIds,
} from "@/lib/intigo-parcels";

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
  } catch {
    return NextResponse.json({ ok: false, message: "Erreur serveur." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json().catch(() => ({}));
    const { nid, action } = body;

    // 1. Création directe d'un colis Intigo via POST /v3/parcels/
    if (!action && (body.recipient_name || body.destination_city_id !== undefined || body.destination_address)) {
      const res = await createParcelByIds(teamId, body);
      if (!res.ok) {
        return NextResponse.json(
          { success: false, message: res.message, code: res.code },
          { status: res.httpStatus || 400 }
        );
      }
      const data = res.data as any;
      const createdNid = data?.nid || data?.parcel?.nid || data?.data?.nid;
      if (createdNid) {
        try {
          const { prisma } = await import("@/lib/prisma");
          await (prisma as any).intigoParcel.upsert({
            where: { teamId_nid: { teamId, nid: String(createdNid) } },
            create: {
              teamId,
              nid: String(createdNid),
              cid: body.cid ? String(body.cid).slice(0, 50) : undefined,
              codAmount: Number(body.price) || 0,
              recipientName: String(body.recipient_name || "").slice(0, 200),
              phone: String(body.phone1 || "").slice(0, 60),
              cityId: body.destination_city_id ? Number(body.destination_city_id) : null,
              districtId: body.destination_district_id ? Number(body.destination_district_id) : null,
              pickupIndex: body.pickup_index !== undefined ? Number(body.pickup_index) : 0,
              rawDetail: data,
              lastSyncAt: new Date(),
            },
            update: {
              cid: body.cid ? String(body.cid).slice(0, 50) : undefined,
              codAmount: Number(body.price) || 0,
              recipientName: String(body.recipient_name || "").slice(0, 200),
              phone: String(body.phone1 || "").slice(0, 60),
              rawDetail: data,
              lastSyncAt: new Date(),
            },
          });
        } catch {}
      }
      return NextResponse.json({ success: true, nid: createdNid }, { status: 201 });
    }

    if (!nid) return NextResponse.json({ ok: false, message: "nid requis." }, { status: 400 });
    if (action === "exchange") return NextResponse.json(await createExchange(teamId, body.payload || {}));
    if (!action) return NextResponse.json({ ok: false, message: "action requise." }, { status: 400 });
    const { nid: _n, action: _a, ...rest } = body;
    return NextResponse.json(await parcelAction(teamId, String(nid), String(action), rest));
  } catch {
    return NextResponse.json({ ok: false, message: "Erreur serveur." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json().catch(() => ({}));
    const { nid, patch } = body;
    if (!nid || !patch) return NextResponse.json({ ok: false, message: "nid et patch requis." }, { status: 400 });
    return NextResponse.json(await patchParcel(teamId, String(nid), patch));
  } catch {
    return NextResponse.json({ ok: false, message: "Erreur serveur." }, { status: 500 });
  }
}
