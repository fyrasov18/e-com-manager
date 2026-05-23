import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getTeamId(): Promise<string | null> {
  const teams = await prisma.team.findMany({ take: 1 });
  return teams[0]?.id ?? null;
}

export async function POST(req: NextRequest) {
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

    if (payment.isValidated) {
      return NextResponse.json({ success: false, message: "Paiement déjà validé" }, { status: 400 });
    }

    await prisma.instaDeliveryPayment.update({
      where: { id: paymentId },
      data: {
        isValidated: true,
        validatedAt: new Date(),
        status: "VALIDÉ",
      },
    });

    const orders = await prisma.order.findMany({ where: { teamId, trackingNumber: payment.trackingNumber } });
    if (orders.length > 0) {
      const order = orders[0];
      await prisma.order.update({
        where: { id: order.id },
        data: {
          revenue: order.revenue + payment.amount,
          profit: (order.revenue + payment.amount) - order.cost,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Paiement de ${payment.amount} DT validé`,
      amount: payment.amount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.error("Validate payment error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}