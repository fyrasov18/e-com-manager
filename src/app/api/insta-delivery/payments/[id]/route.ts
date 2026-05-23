import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getTeamId(): Promise<string | null> {
  const teams = await prisma.team.findMany({ take: 1 });
  return teams[0]?.id ?? null;
}

export async function PATCH(req: NextRequest) {
  try {
    const teamId = await getTeamId();
    if (!teamId) {
      return NextResponse.json({ success: false, message: "Aucune équipe trouvée" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get("id");

    if (!paymentId) {
      return NextResponse.json({ success: false, message: "ID requis" }, { status: 400 });
    }

    const body = await req.json();
    const { reference, trackingNumber, amount, status } = body;

    const payment = await prisma.instaDeliveryPayment.findFirst({
      where: { id: paymentId, teamId },
    });

    if (!payment) {
      return NextResponse.json({ success: false, message: "Paiement non trouvé" }, { status: 404 });
    }

    const updated = await prisma.instaDeliveryPayment.update({
      where: { id: paymentId },
      data: {
        reference: reference ?? payment.reference,
        trackingNumber: trackingNumber !== undefined ? trackingNumber : payment.trackingNumber,
        amount: parseFloat(amount) || payment.amount,
        status: status ?? payment.status,
      },
    });

    return NextResponse.json({ success: true, payment: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.error("Update payment error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const teamId = await getTeamId();
    if (!teamId) {
      return NextResponse.json({ success: false, message: "Aucune équipe trouvée" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get("id");

    if (!paymentId) {
      return NextResponse.json({ success: false, message: "ID requis" }, { status: 400 });
    }

    const payment = await prisma.instaDeliveryPayment.findFirst({
      where: { id: paymentId, teamId },
    });

    if (!payment) {
      return NextResponse.json({ success: false, message: "Paiement non trouvé" }, { status: 404 });
    }

    await prisma.instaDeliveryPayment.delete({
      where: { id: paymentId },
    });

    return NextResponse.json({ success: true, message: "Paiement supprimé" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.error("Delete payment error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}