// src/app/api/cosmos/payments/route.ts — Gestion des règlements Cosmos Delivery (GET list / POST receive).
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { listCosmosPayments, receiveCosmosPayment, getCosmosPayment } from "@/lib/cosmos-api";

export async function GET(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || 20;

    if (id) {
      const res = await getCosmosPayment(teamId, id);
      if (!res.ok) {
        return NextResponse.json({ success: false, message: res.message }, { status: res.httpStatus || 400 });
      }
      return NextResponse.json(res.data);
    }

    const res = await listCosmosPayments(teamId, page, limit);
    if (!res.ok) {
      return NextResponse.json({ success: false, message: res.message }, { status: res.httpStatus || 400 });
    }
    return NextResponse.json(res.data);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();
    const { paymentId } = body;

    if (!paymentId) {
      return NextResponse.json({ success: false, message: "ID de règlement manquant" }, { status: 400 });
    }

    const res = await receiveCosmosPayment(teamId, paymentId);
    if (!res.ok) {
      return NextResponse.json({ success: false, message: res.message }, { status: res.httpStatus || 400 });
    }

    return NextResponse.json(res.data);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || "Erreur serveur" }, { status: 500 });
  }
}
