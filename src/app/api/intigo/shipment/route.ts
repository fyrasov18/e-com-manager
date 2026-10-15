import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { prisma } from "@/lib/prisma";
import { resolveIntigoConfig } from "@/lib/intigo-config";
import { createParcelByIds, createParcelByName } from "@/lib/intigo-parcels";
import { buildIntigoCid, findIntigoParcelByOrder, logIntigoHistory } from "@/lib/intigo-domain";

function cod(order: any): number {
  const v = Number(order.revenue ?? 0);
  const paid = ["VALIDATED", "RECEIVED", "PAID"].includes(String(order.paymentStatus || "").toUpperCase());
  if (paid) return 0;
  return Number.isFinite(v) && v >= 0 ? v : 0;
}
function nidOf(d: any): string | null {
  const c = [d?.nid, d?.parcel?.nid, d?.data?.nid, d?.result?.nid];
  for (const x of c) if (x && String(x).trim()) return String(x).trim();
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json().catch(() => ({}));
    const { orderId, mode, payload } = body as any;
    if (!orderId) return NextResponse.json({ success: false, message: "orderId requis." }, { status: 400 });
    const order = await prisma.order.findFirst({ where: { id: orderId, teamId } });
    if (!order) return NextResponse.json({ success: false, message: "Commande non trouvée." }, { status: 404 });
    const existing = await findIntigoParcelByOrder(teamId, orderId);
    if (existing) return NextResponse.json({ success: false, message: `Colis déjà créé (NID ${existing.nid}).`, nid: existing.nid, duplicate: true }, { status: 409 });
    if (order.trackingNumber && String(order.shippingProvider || "").includes("INTIGO")) {
      return NextResponse.json({ success: false, message: "Déjà expédiée via Intigo.", duplicate: true }, { status: 409 });
    }
    const cfg = await resolveIntigoConfig(teamId);
    if (!cfg) return NextResponse.json({ success: false, message: "Clé API Intigo non configurée." }, { status: 401 });
    const p = payload || {};
    const pkRaw = p.pickup_index ?? cfg.defaultPickupIndex;
    const pk = pkRaw === null || pkRaw === undefined || String(pkRaw) === "" ? NaN : Number(pkRaw);
    if (!Number.isInteger(pk)) return NextResponse.json({ success: false, message: "pickup_index requis.", missingFields: ["pickup_index"] }, { status: 400 });
    const base: any = {
      recipient_name: p.recipient_name ?? order.customerName ?? "",
      phone1: p.phone1 ?? order.customerPhone ?? "",
      destination_address: p.destination_address ?? (order as any).shippingAddress ?? "",
      price: p.price !== undefined ? p.price : cod(order),
      pickup_index: pk, cid: p.cid ?? buildIntigoCid(order.id, teamId),
    };
    if (p.phone2) base.phone2 = p.phone2;
    if (p.client_email ?? (order as any).customerEmail) base.client_email = p.client_email ?? (order as any).customerEmail;
    base.package_size = p.package_size ?? 1;
    base.description = p.description ?? (order as any).productName ?? `Commande ${order.id.slice(0, 8)}`;
    if (p.additional_info ?? (order as any).notes) base.additional_info = p.additional_info ?? (order as any).notes;
    const result: any = (mode || "ids") === "by-name"
      ? await createParcelByName(teamId, { ...base, city_name: p.city_name, district_name: p.district_name, ...(p.neighborhood_name ? { neighborhood_name: p.neighborhood_name } : {}) })
      : await createParcelByIds(teamId, { ...base, destination_city_id: p.destination_city_id, destination_district_id: p.destination_district_id, destination_neighborhood_id: p.destination_neighborhood_id });
    if (!result.ok) {
      await logIntigoHistory(teamId, { orderId, action: "create", success: false, message: result.message });
      const st = result.httpStatus === 401 ? 401 : result.httpStatus || 400;
      return NextResponse.json({ success: false, message: result.message, code: result.code }, { status: st });
    }
    const nid = nidOf(result.data);
    if (!nid) return NextResponse.json({ success: false, message: "Sans NID: vérifiez côté Intigo avant réessai." }, { status: 502 });
    try {
      await (prisma as any).intigoParcel.create({ data: { teamId, orderId, nid, cid: base.cid, codAmount: Number(base.price) || 0, recipientName: String(base.recipient_name).slice(0, 200), phone: String(base.phone1).slice(0, 60), cityId: base.destination_city_id ?? null, districtId: base.destination_district_id ?? null, pickupIndex: pk, rawDetail: result.data ?? {}, lastSyncAt: new Date() } });
    } catch (e: any) {
      if (String(e?.code) === "P2002") return NextResponse.json({ success: false, message: "Doublon concurrence.", duplicate: true }, { status: 409 });
      throw e;
    }
    await prisma.order.update({ where: { id: orderId }, data: { trackingNumber: nid, shippingProvider: "INTIGO", apiStatus: "CREATED" } }).catch(() => {});
    await logIntigoHistory(teamId, { orderId, nid, action: "create", success: true, message: `NID ${nid}` });
    return NextResponse.json({ success: true, message: `Colis créé (NID ${nid}).`, nid });
  } catch (e) {
    console.error("[Intigo shipment]", e);
    return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
  }
}
