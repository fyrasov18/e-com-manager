import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { getColissimoConfig, listColis, getColisDetails, mapColissimoStatus } from "@/lib/colissimo";
import { prisma } from "@/lib/prisma";

// ── Helper: upsert order + delivery revenue ───────────────────────────
async function processOneColis(teamId: string, colis: any) {
  const { getFinanceSettings, calculateOrderFinance } = await import("@/lib/finance");
  const { pickOperationDate } = await import("@/lib/date-utils");
  
  const isPaymentReceived =
    !!colis.numPaiement ||
    colis.mappedStatus === "PAID_DELIVERED" ||
    String(colis.etat ?? "").toLowerCase().includes("payé") ||
    String(colis.etat ?? "").toLowerCase().includes("paye");

  const paymentStatus = isPaymentReceived ? "RECEIVED" : "PENDING";

  // Récupérer les paramètres de coût pour Colissimo
  const settings = await getFinanceSettings(teamId, "COLISSIMO");
  
  // Calculer la finance basée sur les nouvelles règles
  const finance = calculateOrderFinance({
    totalAmount: colis.prix || 0,
    status: colis.mappedStatus,
    settings
  });

  const existing = await prisma.order.findFirst({
    where: {
      teamId,
      OR: [
        { trackingNumber: colis.codeBar },
        ...(colis.reference ? [{ reference: colis.reference }] : []),
      ],
    },
  });

  let orderId: string;
  const now = new Date();
  const apiOperationDate = pickOperationDate(colis);
  const operationDate = apiOperationDate || existing?.operationDate || now;
  const importedAt = now;

  let deliveredAt = existing?.deliveredAt || undefined;
  let returnedAt = existing?.returnedAt || undefined;
  
  if (colis.mappedStatus === "LIVRE" || colis.mappedStatus === "PAID_DELIVERED") {
    deliveredAt = operationDate;
  }
  if (colis.mappedStatus === "RETOURNE") {
    returnedAt = operationDate;
  }

  if (existing) {
    await prisma.order.update({
      where: { id: existing.id },
      data: {
        status: colis.mappedStatus,
        apiStatus: colis.etat || undefined,
        customerName: colis.client || existing.customerName || undefined,
        customerPhone: colis.tel1 || existing.customerPhone || undefined,
        shippingAddress: colis.adresse || existing.shippingAddress || undefined,
        shippingCity: colis.ville || existing.shippingCity || undefined,
        revenue: colis.prix > 0 ? colis.prix : existing.revenue,
        // Nouveaux champs financiers
        validatedRevenue: finance.validatedRevenue,
        deliveryCostApplied: finance.deliveryCostApplied,
        returnCostApplied: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netProfit: finance.netProfit,
        // Legacy/Backup fields
        deliveryFee: colis.fraisLivraison > 0 ? colis.fraisLivraison : existing.deliveryFee,
        returnFee: colis.fraisRetour > 0 ? colis.fraisRetour : existing.returnFee,
        paymentNumber: colis.numPaiement || existing.paymentNumber || undefined,
        deliveredAt: colis.dateLivraison ? new Date(colis.dateLivraison) : deliveredAt,
        pickedUpAt: colis.dateEnlevement ? new Date(colis.dateEnlevement) : existing.pickedUpAt,
        shippingProvider: "COLISSIMO",
        operationDate,
        importedAt,
        returnedAt,
      },
    });
    orderId = existing.id;
  } else {
    const newOrder = await prisma.order.create({
      data: {
        teamId,
        status: colis.mappedStatus,
        revenue: colis.prix || 0,
        cost: 0,
        profit: 0,
        // Nouveaux champs financiers
        validatedRevenue: finance.validatedRevenue,
        deliveryCostApplied: finance.deliveryCostApplied,
        returnCostApplied: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netProfit: finance.netProfit,
        shippingProvider: "COLISSIMO",
        trackingNumber: colis.codeBar || undefined,
        reference: colis.reference || undefined,
        customerName: colis.client || undefined,
        customerPhone: colis.tel1 || undefined,
        shippingAddress: colis.adresse || undefined,
        shippingCity: colis.ville || undefined,
        shippingZip: colis.gouvernorat || undefined,
        apiStatus: colis.etat || undefined,
        deliveryFee: colis.fraisLivraison || 0,
        returnFee: colis.fraisRetour || 0,
        paymentNumber: colis.numPaiement || undefined,
        deliveredAt: colis.dateLivraison ? new Date(colis.dateLivraison) : deliveredAt,
        pickedUpAt: colis.dateEnlevement ? new Date(colis.dateEnlevement) : undefined,
        operationDate,
        importedAt,
        returnedAt,
      },
    });
    orderId = newOrder.id;
  }

  // Upsert DeliveryRevenue
  const existingRevenue = await prisma.deliveryRevenue.findFirst({
    where: {
      teamId,
      provider: "COLISSIMO",
      OR: [
        colis.codeBar ? { trackingNumber: colis.codeBar } : undefined,
        colis.numPaiement ? { paymentNumber: colis.numPaiement } : undefined,
      ].filter(Boolean) as any[],
    },
  });

  if (existingRevenue) {
    await prisma.deliveryRevenue.update({
      where: { id: existingRevenue.id },
      data: {
        orderId,
        apiStatus: colis.etat,
        paymentStatus,
        ...(colis.prix > 0 && { amount: colis.prix }),
        deliveryFee: finance.deliveryCostApplied,
        returnFee: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netAmount: finance.netProfit,
        ...(colis.numPaiement && { paymentNumber: colis.numPaiement }),
      },
    });
  } else {
    await prisma.deliveryRevenue.create({
      data: {
        team: { connect: { id: teamId } },
        provider: "COLISSIMO",
        ...(orderId && { order: { connect: { id: orderId } } }),
        trackingNumber: colis.codeBar || undefined,
        reference: colis.reference || undefined,
        amount: colis.prix || 0,
        deliveryFee: finance.deliveryCostApplied,
        returnFee: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netAmount: finance.netProfit,
        apiStatus: colis.etat,
        paymentNumber: colis.numPaiement || undefined,
        paymentStatus,
        isValidated: false,
        customerName: colis.client || undefined,
        source: "API_IMPORT",
      },
    });
  }

  return { action: existing ? "updated" : "imported", paymentStatus };
}


// ── GET: list existing Colissimo orders in DB ─────────────────────────
export async function GET() {
  try {
    const teamId = await getOrCreateDefaultTeamId();

    const [orders, revenues] = await Promise.all([
      prisma.order.findMany({
        where: { teamId, shippingProvider: "COLISSIMO" },
        select: { id: true, trackingNumber: true, status: true, revenue: true, paymentNumber: true, apiStatus: true },
      }),
      prisma.deliveryRevenue.findMany({
        where: { teamId, provider: "COLISSIMO" },
        select: { id: true, trackingNumber: true, paymentStatus: true, amount: true, apiStatus: true },
      }),
    ]);

    const config = await getColissimoConfig(teamId);

    return NextResponse.json({
      configured: !!config,
      ordersInDB: orders.length,
      revenuesInDB: revenues.length,
      orders,
      revenues,
    });
  } catch (err) {
    console.error("[Colissimo BulkImport GET]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ── POST: bulk import from codeBars list or re-sync all DB orders ─────
export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json().catch(() => ({}));
    const { codeBars, mode } = body;
    // mode: "codebars" | "resync" (re-sync all existing Colissimo orders in DB)

    const config = await getColissimoConfig(teamId);
    if (!config) {
      return NextResponse.json({ success: false, message: "Colissimo non configuré." }, { status: 400 });
    }

    let targetCodeBars: string[] = [];

    if (mode === "resync") {
      // Pull all tracked Colissimo orders already in DB
      const existing = await prisma.order.findMany({
        where: { teamId, shippingProvider: "COLISSIMO", trackingNumber: { not: null } },
        select: { trackingNumber: true },
      });
      targetCodeBars = existing
        .map((o: { trackingNumber: string | null }) => o.trackingNumber)
        .filter((trackingNumber: string | null): trackingNumber is string => Boolean(trackingNumber));
    } else {
      // User-provided list
      if (!codeBars || !Array.isArray(codeBars) || codeBars.length === 0) {
        return NextResponse.json({ success: false, message: "codeBars[] requis ou utilisez mode=resync" }, { status: 400 });
      }
      targetCodeBars = (codeBars as string[]).map(c => c.trim()).filter(Boolean);
    }

    if (targetCodeBars.length === 0) {
      return NextResponse.json({ success: false, message: "Aucun code barre à traiter." }, { status: 400 });
    }

    const results = { imported: 0, updated: 0, failed: 0, paymentsReceived: 0, details: [] as any[] };

    // Process in batches of 50 (API v2 limit)
    const BATCH = 50;
    for (let i = 0; i < targetCodeBars.length; i += BATCH) {
      const batch = targetCodeBars.slice(i, i + BATCH);

      let colisList: any[] = [];
      let batchErrors: string[] = [];

      const listResult = await listColis(teamId, batch);
      if (listResult.success && listResult.colis.length > 0) {
        colisList = listResult.colis;
        batchErrors = listResult.errors;
      } else if (batch.length === 1) {
        const r = await getColisDetails(teamId, batch[0]);
        if (r.success && r.details) colisList = [r.details];
        else batchErrors = [r.error ?? listResult.errors[0] ?? "Erreur API"];
      } else {
        batchErrors = listResult.errors;
      }

      for (const colis of colisList) {
        try {
          const { action, paymentStatus } = await processOneColis(teamId, colis);
          if (action === "imported") results.imported++;
          else results.updated++;
          if (paymentStatus === "RECEIVED") results.paymentsReceived++;
          results.details.push({ codeBar: colis.codeBar, status: colis.mappedStatus, action, paymentStatus });
        } catch (err) {
          results.failed++;
          results.details.push({
            codeBar: colis.codeBar,
            status: "ERROR",
            error: err instanceof Error ? err.message : "Erreur DB",
          });
        }
      }

      for (const errMsg of batchErrors) {
        results.failed++;
        results.details.push({ codeBar: "?", status: "FAILED", error: errMsg });
      }
    }

    const parts = [];
    if (results.imported) parts.push(`${results.imported} importées`);
    if (results.updated) parts.push(`${results.updated} mises à jour`);
    if (results.paymentsReceived) parts.push(`${results.paymentsReceived} paiements reçus`);
    if (results.failed) parts.push(`${results.failed} erreurs`);

    return NextResponse.json({
      success: true,
      message: parts.join(", ") || "Aucun colis traité",
      total: targetCodeBars.length,
      results,
    });
  } catch (err) {
    console.error("[Colissimo BulkImport POST]", err);
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "Erreur serveur" }, { status: 500 });
  }
}
