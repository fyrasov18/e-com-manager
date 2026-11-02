// src/app/api/cosmos/printed/route.ts — Marquer les bordereaux comme imprimés chez Cosmos Delivery.
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { markCosmosOrdersPrinted } from "@/lib/cosmos-api";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();
    const barcodes: string[] = Array.isArray(body.barcodes) ? body.barcodes : [];
    const printed: boolean = body.printed !== undefined ? Boolean(body.printed) : true;

    if (barcodes.length === 0) {
      return NextResponse.json({ success: false, message: "Aucun code-barres fourni" }, { status: 400 });
    }

    const res = await markCosmosOrdersPrinted(teamId, barcodes, printed);
    if (!res.ok) {
      return NextResponse.json({ success: false, message: res.message }, { status: res.httpStatus || 400 });
    }

    // Mettre à jour en local
    if (res.data.updated?.length > 0) {
      await (prisma as any).cosmosOrder.updateMany({
        where: {
          teamId,
          barcode: { in: res.data.updated },
        },
        data: { printed },
      });
    }

    return NextResponse.json(res.data);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || "Erreur serveur" }, { status: 500 });
  }
}
