import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { getColisDetails, listColis, mapColissimoStatus } from "@/lib/colissimo";
import { prisma } from "@/lib/prisma";
import { normalizeTrackingCode, parseTrackingCodes, isValidTrackingCode } from "@/lib/tracking-utils";
import { calculateOrderFinance, getFinanceSettings } from "@/lib/finance";

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  details: Array<{
    codeBar: string;
    status: string;
    action?: string;
    error?: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();
    const { codeBars, codes, text } = body;
    
    let rawInput: string[] = [];
    if (Array.isArray(codeBars)) rawInput = [...rawInput, ...codeBars];
    if (Array.isArray(codes)) rawInput = [...rawInput, ...codes];
    if (typeof text === "string") rawInput = [...rawInput, ...parseTrackingCodes(text)];

    rawInput = rawInput.map(String);

    const rawCleaned = rawInput.map(normalizeTrackingCode).filter(Boolean);

    if (rawCleaned.length === 0) {
      return NextResponse.json(
        { success: false, message: "Aucun code fourni" },
        { status: 400 }
      );
    }

    const cleaned: string[] = [];
    const results: ImportResult = { imported: 0, updated: 0, skipped: 0, failed: 0, details: [] };

    for (const c of rawCleaned) {
      if (!isValidTrackingCode(c)) {
        results.failed++;
        results.details.push({
          codeBar: c,
          status: "FAILED",
          error: "Format invalide (attendu: 12 à 14 chiffres)",
        });
      } else {
        cleaned.push(c);
      }
    }

    if (cleaned.length === 0) {
      return NextResponse.json({
        success: true,
        message: results.failed > 0 ? "Tous les codes sont invalides" : "Aucun code détecté",
        results,
      });
    }

    // Utiliser listColis (v2) pour bulk, getColisDetails pour single
    const colisList =
      cleaned.length === 1
        ? await getSingleColis(teamId, cleaned[0])
        : await getBulkColis(teamId, cleaned);

    for (const colis of colisList.success) {
      try {
        const existing = await prisma.order.findFirst({
          where: {
            teamId,
            OR: [
              { trackingNumber: colis.codeBar, shippingProvider: "COLISSIMO_TN" },
              ...(colis.reference
                ? [{ trackingNumber: colis.reference, shippingProvider: "COLISSIMO_TN" }]
                : []),
            ],
          },
        });

        const status = String(colis.etat ?? colis.mappedStatus ?? "").toLowerCase();
        const isPaymentReceived =
          !!colis.numPaiement ||
          status === "livré payé" ||
          status.includes("payé") ||
          status.includes("paye") ||
          status.includes("paid") ||
          colis.mappedStatus === "PAID_DELIVERED";

        const paymentStatus = isPaymentReceived ? "RECEIVED" : "PENDING";

        console.log("[Colissimo] DeliveryRevenue import", {
          provider: "COLISSIMO",
          trackingNumber: colis.codeBar,
          apiStatus: colis.etat,
          paymentNumber: colis.numPaiement,
          amount: colis.prix,
          decision: paymentStatus,
        });

        const { pickOperationDate } = await import("@/lib/date-utils");
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
          // Mise à jour : status + montants si disponibles, conserver champs existants si API retourne vide
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
              deliveryFee: colis.fraisLivraison > 0 ? colis.fraisLivraison : existing.deliveryFee,
              returnFee: colis.fraisRetour > 0 ? colis.fraisRetour : existing.returnFee,
              paymentNumber: colis.numPaiement || existing.paymentNumber || undefined,
              deliveredAt: colis.dateLivraison ? new Date(colis.dateLivraison) : deliveredAt,
              pickedUpAt: colis.dateEnlevement ? new Date(colis.dateEnlevement) : existing.pickedUpAt,
              operationDate,
              importedAt,
              returnedAt,
            },
          });

          // Mettre à jour DeliveryRevenue si existe
          await upsertDeliveryRevenue(teamId, colis, existing.id, paymentStatus);
          await updateOrderFinance(teamId, existing.id, "COLISSIMO", existing.revenue || colis.prix, colis.mappedStatus);

          results.updated++;
          results.details.push({ codeBar: colis.codeBar, status: colis.mappedStatus, action: "updated" });
        } else {
          // Création nouvelle commande
          const newOrder = await prisma.order.create({
            data: {
              teamId,
              status: colis.mappedStatus,
              revenue: colis.prix,
              cost: 0,
              profit: 0,
              shippingProvider: "COLISSIMO_TN",
              trackingNumber: colis.codeBar,
              reference: colis.reference || undefined,
              customerName: colis.client || undefined,
              customerPhone: colis.tel1 || undefined,
              shippingAddress: colis.adresse || undefined,
              shippingCity: colis.ville || undefined,
              shippingZip: colis.gouvernorat || undefined,
              apiStatus: colis.etat || undefined,
              deliveryFee: colis.fraisLivraison,
              returnFee: colis.fraisRetour,
              paymentNumber: colis.numPaiement || undefined,
              deliveredAt: colis.dateLivraison ? new Date(colis.dateLivraison) : deliveredAt,
              pickedUpAt: colis.dateEnlevement ? new Date(colis.dateEnlevement) : undefined,
              operationDate,
              importedAt,
              returnedAt,
            },
          });

          await upsertDeliveryRevenue(teamId, colis, newOrder.id, paymentStatus);
          await updateOrderFinance(teamId, newOrder.id, "COLISSIMO", newOrder.revenue || colis.prix, colis.mappedStatus);

          results.imported++;
          results.details.push({ codeBar: colis.codeBar, status: colis.mappedStatus, action: "imported" });
        }
      } catch (err) {
        results.failed++;
        results.details.push({
          codeBar: colis.codeBar,
          status: "ERROR",
          error: err instanceof Error ? err.message : "Erreur DB",
        });
      }
    }

    // Ajouter les erreurs d'API
    for (const { codeBar, error } of colisList.errors) {
      results.failed++;
      results.details.push({ codeBar, status: "FAILED", error });
    }

    const parts = [];
    if (results.imported) parts.push(`${results.imported} importées`);
    if (results.updated) parts.push(`${results.updated} mises à jour`);
    if (results.skipped) parts.push(`${results.skipped} ignorées`);
    if (results.failed) parts.push(`${results.failed} erreurs`);

    return NextResponse.json({
      success: true,
      message: parts.join(", ") || "Aucune commande traitée",
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.error("[Colissimo] Import error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

async function getSingleColis(
  teamId: string,
  codeBar: string
): Promise<{ success: any[]; errors: Array<{ codeBar: string; error: string }> }> {
  const bulkResult = await listColis(teamId, [codeBar]);
  if (bulkResult.success && bulkResult.colis.length > 0) {
    return { success: bulkResult.colis, errors: [] };
  }

  const result = await getColisDetails(teamId, codeBar);
  if (result.success && result.details) {
    return { success: [result.details], errors: [] };
  }

  const fallbackError = result.error ?? bulkResult.errors[0] ?? "Erreur API";
  return { success: [], errors: [{ codeBar, error: fallbackError }] };
}

async function getBulkColis(
  teamId: string,
  codeBars: string[]
): Promise<{ success: any[]; errors: Array<{ codeBar: string; error: string }> }> {
  const result = await listColis(teamId, codeBars);
  const errors = result.errors.map((e, i) => ({
    codeBar: codeBars[i] ?? "?",
    error: e,
  }));
  return { success: result.colis, errors };
}

async function upsertDeliveryRevenue(
  teamId: string,
  colis: any,
  orderId: string,
  paymentStatus: string
) {
  const trackingNumber = colis.codeBar;
  const reference = colis.reference || colis.codeBar;
  const paymentNumber = colis.numPaiement || null;

  try {
    const existingRevenue = await prisma.deliveryRevenue.findFirst({
      where: {
        teamId,
        provider: "COLISSIMO",
        OR: [
          trackingNumber ? { trackingNumber } : undefined,
          reference ? { reference } : undefined,
          paymentNumber ? { paymentNumber } : undefined,
        ].filter(Boolean) as any[],
      },
    });

    if (existingRevenue) {
      await prisma.deliveryRevenue.update({
        where: { id: existingRevenue.id },
        data: {
          orderId,
          trackingNumber,
          reference,
          apiStatus: colis.etat,
          paymentStatus,
          ...(colis.prix > 0 && { amount: colis.prix }),
          ...(colis.fraisLivraison > 0 && { deliveryFee: colis.fraisLivraison }),
          ...(colis.fraisRetour > 0 && { returnFee: colis.fraisRetour }),
          ...(paymentNumber && { paymentNumber }),
        },
      });
      return;
    }

    await prisma.deliveryRevenue.create({
      data: {
        team: { connect: { id: teamId } },
        provider: "COLISSIMO",
        ...(orderId && { order: { connect: { id: orderId } } }),
        ...(trackingNumber && { trackingNumber }),
        ...(reference && { reference }),
        amount: colis.prix,
        deliveryFee: colis.fraisLivraison,
        returnFee: colis.fraisRetour,
        withholdingTaxApplied: 0,
        apiStatus: colis.etat,
        ...(paymentNumber && { paymentNumber }),
        paymentStatus,
        isValidated: false,
      },
    });
  } catch (e) {
    console.error("[Colissimo] upsertDeliveryRevenue error:", e);
  }
}

async function updateOrderFinance(
  teamId: string,
  orderId: string,
  provider: string,
  revenue: number,
  status: string
) {
  try {
    const settings = await getFinanceSettings(teamId, provider);
    const finance = calculateOrderFinance({
      totalAmount: revenue,
      status,
      settings,
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryCostApplied: finance.deliveryCostApplied,
        returnCostApplied: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        validatedRevenue: finance.validatedRevenue,
        netProfit: finance.netProfit,
      },
    });
  } catch (e) {
    console.error("[Colissimo] updateOrderFinance error:", e);
  }
}
