import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { getColissimoConfig, getColisDetails, listColis } from "@/lib/colissimo";
import { getInstaDeliveryConfig, trackInstaDeliveryParcel } from "@/lib/instavia-delivery";
import { prisma } from "@/lib/prisma";
import { parseOperationDate } from "@/lib/date-utils";
import {
  mapColissimoStatusStr,
  mapInstaDeliveryStatusCode,
  mapInstaDeliveryStatusStr,
  isReturnStatus,
} from "@/lib/delivery-status";
import { normalizeTrackingCode, parseTrackingCodes, isValidTrackingCode, detectTrackingProvider } from "@/lib/tracking-utils";

type ImportProvider = "AUTO" | "COLISSIMO" | "INSTADELIVERY";

function explainInstaDeliveryError(error?: string): string {
  if (!error) return "Colis non trouvé";
  if (/invalid barcode/i.test(error)) {
    return "Code-barres InstaDelivery invalide ou non rattaché au compte configuré. Vérifiez le code dans InstaDelivery.";
  }
  return error;
}

/**
 * POST /api/orders/import-tracking
 * Importe une liste de codeBars/tracking depuis Colissimo ou InstaDelivery.
 * Crée ou met à jour les commandes en base.
 */
export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();
    const { trackingNumbers, codes, text } = body;
    const selectedProvider: ImportProvider =
      body.provider === "COLISSIMO" || body.provider === "INSTADELIVERY" ? body.provider : "AUTO";
    
    let rawInput: string[] = [];
    if (Array.isArray(trackingNumbers)) rawInput = [...rawInput, ...trackingNumbers];
    if (Array.isArray(codes)) rawInput = [...rawInput, ...codes];
    if (typeof text === "string") rawInput = [...rawInput, ...parseTrackingCodes(text)];

    rawInput = rawInput.map(String);

    const rawCleaned = rawInput.map(normalizeTrackingCode).filter(Boolean);

    if (rawCleaned.length === 0) {
      return NextResponse.json({ success: false, message: "Aucun code fourni" }, { status: 400 });
    }

    const colissimoCodes: string[] = [];
    const instaCodes: string[] = [];
    const results = { created: 0, updated: 0, failed: 0, details: [] as any[] };

    for (const c of rawCleaned) {
      if (!isValidTrackingCode(c)) {
        results.failed++;
        results.details.push({ tracking: c, status: "FAILED", error: "Format invalide (attendu: 10 à 18 chiffres)" });
        continue;
      }
      const detected = detectTrackingProvider(c);

      if (selectedProvider === "COLISSIMO") {
        if (detected === "InstaDelivery") {
          results.failed++;
          results.details.push({ tracking: c, status: "FAILED", error: "Ce code semble être InstaDelivery. Choisissez InstaDelivery ou Auto-détection." });
          continue;
        }
        colissimoCodes.push(c);
        continue;
      }

      if (selectedProvider === "INSTADELIVERY") {
        if (detected === "Colissimo") {
          results.failed++;
          results.details.push({ tracking: c, status: "FAILED", error: "Ce code semble être Colissimo. Choisissez Colissimo ou Auto-détection." });
          continue;
        }
        instaCodes.push(c);
        continue;
      }

      if (detected === "Colissimo") {
        colissimoCodes.push(c);
      } else if (detected === "InstaDelivery") {
        instaCodes.push(c);
      } else {
        results.failed++;
        results.details.push({ tracking: c, status: "FAILED", error: "Prestataire non détecté pour ce format de code" });
      }
    }

    if (colissimoCodes.length === 0 && instaCodes.length === 0) {
      return NextResponse.json({
        success: true,
        message: results.failed > 0 ? "Tous les codes sont invalides" : "Aucun code détecté",
        results,
      });
    }

    console.log(`[import-tracking] Colissimo: ${colissimoCodes.length} | InstaDelivery: ${instaCodes.length}`);

    if (colissimoCodes.length > 0) {
      const config = await getColissimoConfig(teamId);
      if (!config) {
        results.failed += colissimoCodes.length;
        colissimoCodes.forEach(c => results.details.push({ tracking: c, error: "Colissimo non configuré" }));
      } else {
        const BATCH = 50;
        for (let i = 0; i < colissimoCodes.length; i += BATCH) {
          const batch = colissimoCodes.slice(i, i + BATCH);

          if (batch.length >= 1) {
            const r = await listColis(teamId, batch);
            if (r.success && r.colis.length > 0) {
              for (const c of r.colis) {
                try {
                  const action = await upsertColissimoOrder(teamId, c);
                  if (action === "created") results.created++;
                  else results.updated++;
                  results.details.push({ tracking: c.codeBar, status: c.etat, action, provider: "COLISSIMO" });
                } catch (e) {
                  results.failed++;
                  results.details.push({ tracking: c.codeBar ?? "?", error: e instanceof Error ? e.message : String(e) });
                }
              }
              for (const err of r.errors) { results.failed++; results.details.push({ tracking: "?", error: err }); }
              continue;
            }
            console.log(`[import-tracking] listColis v2 failed, fallback to individual getColis`);
          }

          // Traitement individuel
          for (const codeBar of batch) {
            try {
              const r = await getColisDetails(teamId, codeBar);
              console.log(`[import-tracking] Colissimo ${codeBar}: success=${r.success} error=${r.error ?? "-"}`);
              if (r.success && r.details) {
                const action = await upsertColissimoOrder(teamId, r.details);
                if (action === "created") results.created++;
                else results.updated++;
                results.details.push({ tracking: codeBar, status: r.details.etat, action, provider: "COLISSIMO" });
              } else {
                results.failed++;
                results.details.push({ tracking: codeBar, error: r.error ?? "Colis non trouvé" });
              }
            } catch (e) {
              results.failed++;
              results.details.push({ tracking: codeBar, error: e instanceof Error ? e.message : String(e) });
            }
          }
        }
      }
    }

    if (instaCodes.length > 0) {
      const config = await getInstaDeliveryConfig(teamId);
      if (!config) {
        results.failed += instaCodes.length;
        instaCodes.forEach(c => results.details.push({ tracking: c, error: "InstaDelivery non configuré" }));
      } else {
        for (const tracking of instaCodes) {
          try {
            const r = await trackInstaDeliveryParcel(tracking, config.id);
            console.log(`[import-tracking] InstaDelivery ${tracking}: success=${r.success} etat=${r.colis?.etat_str ?? "-"} error=${r.error ?? "-"}`);
            if (!r.success || !r.colis) {
              results.failed++;
              results.details.push({ tracking, error: explainInstaDeliveryError(r.error) });
              continue;
            }
            const action = await upsertInstaOrder(teamId, r.colis);
            if (action === "created") results.created++;
            else results.updated++;
            results.details.push({ tracking, status: r.colis.etat_str, action, provider: "INSTADELIVERY" });
          } catch (e) {
            results.failed++;
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error(`[import-tracking] InstaDelivery ${tracking} exception:`, errMsg);
            results.details.push({ tracking, error: errMsg });
          }
        }
      }
    }

    const parts = [];
    if (results.created) parts.push(`${results.created} créées`);
    if (results.updated) parts.push(`${results.updated} mises à jour`);
    if (results.failed) parts.push(`${results.failed} erreurs`);

    console.log(`[import-tracking] Done: created=${results.created} updated=${results.updated} failed=${results.failed}`);

    return NextResponse.json({
      success: true,
      message: parts.join(", ") || "Aucune commande traitée",
      results,
    });
  } catch (err) {
    console.error("[import-tracking] Error:", err);
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "Erreur serveur" }, { status: 500 });
  }
}

// ── Upsert Colissimo order ────────────────────────────────────────────
async function upsertColissimoOrder(teamId: string, c: any): Promise<"created" | "updated"> {
  const mappedStatus = mapColissimoStatusStr(c.etat ?? "");
  const isPaid = mappedStatus === "PAID_DELIVERED" || !!c.numPaiement;
  const isReturn = isReturnStatus(mappedStatus);

  const { getFinanceSettings, calculateOrderFinance } = await import("@/lib/finance");
  const settings = await getFinanceSettings(teamId, "COLISSIMO");
  const finance = calculateOrderFinance({
    totalAmount: c.prix || 0,
    status: mappedStatus,
    settings
  });

  const existing = await prisma.order.findFirst({
    where: {
      teamId,
      shippingProvider: "COLISSIMO",
      OR: [
        { trackingNumber: c.codeBar },
        ...(c.reference ? [{ reference: c.reference }] : []),
      ],
    },
  });

  // ── Résoudre operationDate : livraison > enlèvement > dateCreation
  const colisOpDate =
    parseOperationDate(c.dateLivraison) ||
    parseOperationDate(c.dateEnlevement) ||
    parseOperationDate(c.dateCreation) ||
    null;

  if (existing) {
    await prisma.order.update({
      where: { id: existing.id },
      data: {
        status: mappedStatus,
        apiStatus: c.etat || existing.apiStatus,
        customerName: c.client || existing.customerName,
        customerPhone: c.tel1 || existing.customerPhone,
        shippingAddress: c.adresse || existing.shippingAddress,
        shippingCity: c.ville || existing.shippingCity,
        revenue: c.prix > 0 ? c.prix : existing.revenue,
        validatedRevenue: finance.validatedRevenue,
        deliveryCostApplied: finance.deliveryCostApplied,
        returnCostApplied: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netProfit: finance.netProfit,
        paymentNumber: c.numPaiement || existing.paymentNumber,
        deliveredAt: c.dateLivraison ? new Date(c.dateLivraison) : existing.deliveredAt,
        pickedUpAt: c.dateEnlevement ? new Date(c.dateEnlevement) : existing.pickedUpAt,
        // Toujours mettre à jour operationDate si l'API retourne une date
        operationDate: colisOpDate ?? existing.operationDate,
        importedAt: new Date(),
      },
    });
    if (isReturn) await maybeCreateReturnStockMovement(existing.id);
    await maybeUpsertRevenue(teamId, existing.id, "COLISSIMO", c.codeBar, c.reference, c.etat, finance.validatedRevenue || c.prix || 0, finance.deliveryCostApplied, finance.returnCostApplied, finance.withholdingTaxApplied, c.numPaiement, isPaid && !isReturn, c.client);
    return "updated";
  }

  const order = await prisma.order.create({
    data: {
      teamId, status: mappedStatus,
      revenue: c.prix || 0, cost: 0, profit: 0,
      validatedRevenue: finance.validatedRevenue,
      deliveryCostApplied: finance.deliveryCostApplied,
      returnCostApplied: finance.returnCostApplied,
      withholdingTaxApplied: finance.withholdingTaxApplied,
      netProfit: finance.netProfit,
      shippingProvider: "COLISSIMO",
      trackingNumber: c.codeBar,
      reference: c.reference,
      customerName: c.client,
      customerPhone: c.tel1,
      shippingAddress: c.adresse,
      shippingCity: c.ville,
      shippingZip: c.gouvernorat,
      apiStatus: c.etat,
      paymentNumber: c.numPaiement,
      deliveredAt: c.dateLivraison ? new Date(c.dateLivraison) : undefined,
      pickedUpAt: c.dateEnlevement ? new Date(c.dateEnlevement) : undefined,
      // Date de la dernière opération API
      operationDate: colisOpDate ?? undefined,
      date: parseOperationDate(c.dateCreation) ?? new Date(),
      importedAt: new Date(),
    },
  });
  if (isReturn) await maybeCreateReturnStockMovement(order.id);
  await maybeUpsertRevenue(teamId, order.id, "COLISSIMO", c.codeBar, c.reference, c.etat, finance.validatedRevenue || c.prix || 0, finance.deliveryCostApplied, finance.returnCostApplied, finance.withholdingTaxApplied, c.numPaiement, isPaid && !isReturn, c.client);
  return "created";
}

// ── Upsert InstaDelivery order ────────────────────────────────────────
async function upsertInstaOrder(teamId: string, colis: any): Promise<"created" | "updated"> {
  const tracking = colis.code_barre ?? colis.tracking_number ?? colis.barcode ?? "";
  const montant = parseFloat(colis.montant_reception ?? colis.amount ?? "0") || 0;
  const etatStr = colis.etat_str ?? colis.status ?? "";

  // Mapping centralisé : etat code en priorité, fallback etat_str
  const mappedStatus = mapInstaDeliveryStatusCode(colis.etat ?? 0) || mapInstaDeliveryStatusStr(etatStr);
  const isPaid = ["PAID_DELIVERED", "DELIVERED", "DELIVERED_CLOSED"].includes(mappedStatus) && montant > 0;
  const isReturn = isReturnStatus(mappedStatus);

  const { getFinanceSettings, calculateOrderFinance } = await import("@/lib/finance");
  const settings = await getFinanceSettings(teamId, "INSTADELIVERY");
  const finance = calculateOrderFinance({
    totalAmount: montant,
    status: mappedStatus,
    settings
  });

  const existing = await prisma.order.findFirst({
    where: {
      teamId,
      shippingProvider: "INSTADELIVERY",
      OR: [
        { trackingNumber: tracking },
        ...(colis.reference ? [{ reference: colis.reference }] : []),
      ],
    },
  });

  // ── Résoudre operationDate depuis last_operation_date (champ API InstaDelivery)
  const instaOpDate = parseOperationDate(colis.last_operation_date) || null;
  const instaCreatedAt = parseOperationDate(colis.created_at) || null;

  // deliveredAt = opDate si statut livré ; pickedUpAt si statut enlevé
  const isDelivered = ["DELIVERED", "DELIVERED_CLOSED", "EXCHANGE_DELIVERED"].includes(mappedStatus);
  const isPickedUp = mappedStatus === "PICKED_UP";

  if (existing) {
    await prisma.order.update({
      where: { id: existing.id },
      data: {
        status: mappedStatus || existing.status,
        apiStatus: etatStr || existing.apiStatus,
        customerName: colis.nom_destinataire || existing.customerName,
        customerPhone: colis.tel_destinataire || existing.customerPhone,
        shippingAddress: colis.adresse_destinataire || existing.shippingAddress,
        revenue: montant > 0 ? montant : existing.revenue,
        validatedRevenue: finance.validatedRevenue,
        deliveryCostApplied: finance.deliveryCostApplied,
        returnCostApplied: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netProfit: finance.netProfit,
        // Dates depuis l'API
        operationDate: instaOpDate ?? existing.operationDate,
        deliveredAt: isDelivered && instaOpDate ? instaOpDate : existing.deliveredAt,
        pickedUpAt: isPickedUp && instaOpDate ? instaOpDate : existing.pickedUpAt,
        paymentNumber: colis.payement_mode || existing.paymentNumber || null,
        importedAt: new Date(),
      },
    });
    if (isReturn) await maybeCreateReturnStockMovement(existing.id);
    await maybeUpsertRevenue(teamId, existing.id, "INSTADELIVERY", tracking, colis.reference, etatStr, finance.validatedRevenue || montant, finance.deliveryCostApplied, finance.returnCostApplied, finance.withholdingTaxApplied, null, isPaid && !isReturn, colis.nom_destinataire);
    return "updated";
  }

  const order = await prisma.order.create({
    data: {
      teamId, status: mappedStatus,
      revenue: montant, cost: 0, profit: 0,
      validatedRevenue: finance.validatedRevenue,
      deliveryCostApplied: finance.deliveryCostApplied,
      returnCostApplied: finance.returnCostApplied,
      withholdingTaxApplied: finance.withholdingTaxApplied,
      netProfit: finance.netProfit,
      shippingProvider: "INSTADELIVERY",
      trackingNumber: tracking,
      reference: colis.reference,
      customerName: colis.nom_destinataire,
      customerPhone: colis.tel_destinataire,
      shippingAddress: colis.adresse_destinataire,
      shippingCity: colis.ville_destinataire,
      apiStatus: etatStr,
      paymentNumber: colis.payement_mode || null,
      // Dates depuis l'API
      operationDate: instaOpDate ?? undefined,
      deliveredAt: isDelivered && instaOpDate ? instaOpDate : undefined,
      pickedUpAt: isPickedUp && instaOpDate ? instaOpDate : undefined,
      date: instaCreatedAt ?? new Date(),
      importedAt: new Date(),
    },
  });
  if (isReturn) await maybeCreateReturnStockMovement(order.id);
  await maybeUpsertRevenue(teamId, order.id, "INSTADELIVERY", tracking, colis.reference, etatStr, finance.validatedRevenue || montant, finance.deliveryCostApplied, finance.returnCostApplied, finance.withholdingTaxApplied, null, isPaid && !isReturn, colis.nom_destinataire);
  return "created";
}

// ── Revenue upsert helper ────────────────────────────────────────────
async function maybeUpsertRevenue(
  teamId: string, orderId: string, provider: string,
  trackingNumber: string, reference: string | null, apiStatus: string,
  amount: number, deliveryFee: number, returnFee: number, withholdingTaxApplied: number,
  paymentNumber: string | null, isPaymentReceived: boolean,
  customerName: string | null,
) {
  try {
    const existing = await prisma.deliveryRevenue.findFirst({
      where: {
        teamId, provider,
        OR: [
          trackingNumber ? { trackingNumber } : undefined,
          paymentNumber ? { paymentNumber } : undefined,
        ].filter(Boolean) as any[],
      },
    });

    if (existing) {
      await prisma.deliveryRevenue.update({
        where: { id: existing.id },
        data: {
          orderId, apiStatus,
          paymentStatus: isPaymentReceived ? "RECEIVED" : existing.paymentStatus,
          ...(amount > 0 && { amount }),
          withholdingTaxApplied: withholdingTaxApplied || 0,
          ...(paymentNumber && { paymentNumber }),
        },
      });
    } else {
      await prisma.deliveryRevenue.create({
        data: {
          team: { connect: { id: teamId } },
          provider, source: "API_SYNC",
          order: { connect: { id: orderId } },
          trackingNumber: trackingNumber || undefined,
          reference: reference || undefined,
          customerName: customerName || undefined,
          amount: amount || 0,
          deliveryFee: deliveryFee || 0,
          returnFee: returnFee || 0,
          withholdingTaxApplied: withholdingTaxApplied || 0,
          netAmount: amount > 0 ? (amount - deliveryFee - returnFee - withholdingTaxApplied) : -(deliveryFee + returnFee + withholdingTaxApplied),
          apiStatus,
          paymentNumber: paymentNumber || undefined,
          paymentStatus: isPaymentReceived ? "RECEIVED" : "PENDING",
          isValidated: false,
        },
      });
    }
  } catch (e) {
    console.error("[import-tracking] revenue upsert error:", e);
  }
}

// ── Mouvement stock retour (anti-doublon) ────────────────────────────
async function maybeCreateReturnStockMovement(orderId: string) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { product: true },
    });
    if (!order || !order.productId) return; // pas de produit lié

    // Anti-doublon : vérifier si un mouvement RETURN_DELIVERED existe déjà
    const existing = await prisma.stockMovement.findFirst({
      where: { orderId, type: "IN", source: "RETURN_DELIVERED" },
    });
    if (existing) {
      console.log(`[import-tracking] Stock return movement already exists for order ${orderId}`);
      return;
    }

    const qty = order.quantity || 1;
    await prisma.stockMovement.create({
      data: {
        productId: order.productId,
        orderId,
        type: "IN",
        quantity: qty,
        source: "RETURN_DELIVERED",
      },
    });

    // Mettre à jour le stock du produit
    await prisma.product.update({
      where: { id: order.productId },
      data: { stockQuantity: { increment: qty } },
    });

    console.log(`[import-tracking] Stock return movement created for order ${orderId}, qty=${qty}`);
  } catch (e) {
    console.error("[import-tracking] stock movement error:", e);
  }
}
