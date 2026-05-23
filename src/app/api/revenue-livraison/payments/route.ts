import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

export async function GET() {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const payments = await prisma.$queryRaw`
      SELECT id, "externalPaymentId", "deliveryCompany", "orderRef", amount, "paidAt", status 
      FROM "DeliveryPayment" 
      WHERE "teamId" = ${teamId}
      ORDER BY "paidAt" DESC 
      LIMIT 200
    `;

    return NextResponse.json(payments);
  } catch {
    return NextResponse.json(
      { error: "Impossible de charger les paiements livraison." },
      { status: 500 }
    );
  }
}