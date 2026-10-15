import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { prisma } from "@/lib/prisma";
import { getParcel, getParcelHistory } from "@/lib/intigo-parcels";
import { mapIntigoStatusCode, intigoStatusLabel, logIntigoHistory } from "@/lib/intigo-domain";

function codeOf(detail: any): string | null {
  const c = [detail?.status, detail?.status_code, detail?.statusCode, detail?.state, detail?.etat, detail?.parcel?.status];
  for (const x of c) if (x !== undefined && x !== null && String(x).trim() !== "") return String(x).trim();
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json().catch(() => ({}));
    const { nid, orderId } = body as any;
    let targetNid = nid ? String(nid) : null;
    let parcelRow: any = null;
    if (!targetNid && orderId) {
      parcelRow = await (prisma as any).intigoParcel.findFirst({ where: { teamId, orderId: String(orderId) } }).catch(() => null);
      targetNid = parcelRow?.nid ?? null;
    } else if (targetNid) {
      parcelRow = await (prisma as any).intigoParcel.findFirst({ where: { teamId, nid: targetNid } }).catch(() => null);
    }
    if (!targetNid) return NextResponse.json({ success: false, message: "nid ou orderId requis." }, { status: 400 });
    const detail = await getParcel(teamId, targetNid);
    if (!detail.ok) return NextResponse.json({ success: false, message: (detail as any).message }, { status: (detail as any).httpStatus || 400 });
    const code = codeOf((detail as any).data);
    const mapped = mapIntigoStatusCode(code);
    const label = intigoStatusLabel(code);
    const data: any = { lastSyncAt: new Date(), syncError: null, rawDetail: (detail as any).data ?? {} };
    if (code !== null) { data.statusCode = Number.isInteger(Number(code)) ? Number(code) : null; data.statusLabel = label; }
    if (parcelRow) await (prisma as any).intigoParcel.update({ where: { id: parcelRow.id }, data }).catch(() => {});
    if (parcelRow?.orderId) {
      await prisma.order.update({ where: { id: parcelRow.orderId }, data: { status: mapped, apiStatus: label } }).catch(() => {});
    }
    try {
      const { prisma: p2 } = await import("@/lib/prisma");
      await (p2 as any).intigoIntegration.updateMany({ where: { teamId }, data: { lastSyncAt: new Date() } });
    } catch {}
    await logIntigoHistory(teamId, { orderId: parcelRow?.orderId ?? orderId ?? null, nid: targetNid, action: "sync", success: true, message: `${code ?? "?"} -> ${mapped}` });
    return NextResponse.json({ success: true, nid: targetNid, statusCode: code, mapped, label });
  } catch (e) {
    return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const { searchParams } = new URL(req.url);
    const nid = searchParams.get("nid");
    if (!nid) return NextResponse.json({ success: false, message: "nid requis." }, { status: 400 });
    const h = await getParcelHistory(teamId, nid);
    return NextResponse.json(h);
  } catch { return NextResponse.json({ success: false, message: "Erreur." }, { status: 500 }); }
}
