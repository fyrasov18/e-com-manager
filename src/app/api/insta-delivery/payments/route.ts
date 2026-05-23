import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPayments, getInstaDeliveryConfig } from "@/lib/instavia-delivery";

async function getTeamId(): Promise<string | null> {
  const teams = await prisma.team.findMany({ take: 1 });
  return teams[0]?.id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const teamId = await getTeamId();
    if (!teamId) {
      return NextResponse.json({ payments: [] });
    }

    const payments = await prisma.instaDeliveryPayment.findMany({
      where: { teamId },
      orderBy: { importedAt: "desc" },
    });

    return NextResponse.json({ payments });
  } catch (err) {
    console.error("Get payments error:", err);
    return NextResponse.json({ payments: [], error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const teamId = await getTeamId();
    if (!teamId) {
      return NextResponse.json({ success: false, message: "Aucune équipe trouvée" }, { status: 400 });
    }

    const config = await getInstaDeliveryConfig(teamId);
    if (!config) {
      return NextResponse.json({ success: false, message: "InstaDelivery non configuré" }, { status: 400 });
    }

    const { payments, message: apiMessage } = await getPayments();
    if (apiMessage && payments.length === 0) {
      return NextResponse.json({ success: false, message: apiMessage }, { status: 400 });
    }
    const paymentsData = payments;

    const results = {
      imported: 0,
      updated: 0,
      failed: 0,
      details: [] as { reference: string; amount: number; status: string; error?: string }[],
    };

    for (const payment of paymentsData) {
      const reference = payment.reference || payment.tracking_number || `PAY-${Date.now()}`;
      const amount = parseFloat(payment.amount ?? payment.montant ?? "0") || 0;

      if (!reference || amount <= 0) {
        results.failed++;
        results.details.push({ reference, amount: 0, status: "FAILED", error: "Données invalides" });
        continue;
      }

      try {
        const existingPayment = await prisma.instaDeliveryPayment.findUnique({
          where: { reference },
        });

        if (existingPayment) {
          await prisma.instaDeliveryPayment.update({
            where: { reference },
            data: {
              amount,
              status: payment.status ?? existingPayment.status,
            },
          });
          results.updated++;
          results.details.push({ reference, amount, status: "Mis à jour" });
        } else {
          await prisma.instaDeliveryPayment.create({
            data: {
              teamId,
              reference,
              trackingNumber: payment.tracking_number || payment.numero_suivi,
              amount,
              status: payment.status ?? "RECU",
              isValidated: false,
            },
          });
          results.imported++;
          results.details.push({ reference, amount, status: "RECU" });
        }
      } catch (err) {
        results.failed++;
        console.error(`Payment import error for ${reference}:`, err);
        results.details.push({ reference, amount, status: "ERROR", error: "Erreur DB" });
      }
    }

    const message = `${results.imported} importés, ${results.updated} mis à jour, ${results.failed} échoués`;
    return NextResponse.json({ success: true, message, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.error("Import payments error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}