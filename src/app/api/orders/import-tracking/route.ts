import { NextRequest, NextResponse } from "next/server";
import { getColissimoConfig, getColisDetails, listColis } from "@/lib/colissimo";
import { getInstaDeliveryConfig, trackInstaDeliveryParcel } from "@/lib/instavia-delivery";
import { resolveIntigoConfig } from "@/lib/intigo-config";
import { getParcel } from "@/lib/intigo-parcels";
import { mapIntigoStatusCode, intigoStatusLabel, logIntigoHistory } from "@/lib/intigo-domain";
import { prisma } from "@/lib/prisma";
import { parseOperationDate } from "@/lib/date-utils";
import { requirePermission } from "@/lib/api-auth";
import {
  mapColissimoStatusStr,
  mapInstaDeliveryStatusCode,
  mapInstaDeliveryStatusStr,
  isReturnStatus,
} from "@/lib/delivery-status";
import { normalizeTrackingCode, parseTrackingCodes, isValidTrackingCode, detectTrackingProvider } from "@/lib/tracking-utils";

type ImportProvider = "AUTO" | "COLISSIMO" | "INSTADELIVERY" | "INTIGO";

function explainInstaDeliveryError(error?: string): string {
  if (!error) return "Colis non trouvé";
  if (/invalid barcode/i.test(error)) {
    return "Code-barres InstaDelivery invalide ou non rattaché au compte configuré. Vérifiez le code dans InstaDelivery.";
  }
  return error;
}

function codeOf(detail: any): string | null {
  const c = [detail?.status, detail?.status_code, detail?.statusCode, detail?.state, detail?.etat, detail?.parcel?.status];
  for (const x of c) if (x !== undefined && x !== null && String(x).trim() !== "") return String(x).trim();
  return null;
}

/**
 * Récupère un colis Intigo : tente avec le code-barres complet (ex: 8743434S8),
 * et si 404, repli sur le NID numérique de base (ex: 8743434).
 */
async function fetchIntigoParcel(teamId: string, tracking: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  const r1 = await getParcel(teamId, tracking);
  if (r1.ok && (r1 as any).data) {
    return { ok: true, data: (r1 as any).data };
  }

  const match = tracking.match(/^(\d{5,10})[A-Z]\d{1,3}$/i);
  if (match) {
    const baseNid = match[1];
    const r2 = await getParcel(teamId, baseNid);
    if (r2.ok && (r2 as any).data) {
      return { ok: true, data: (r2 as any).data };
    }
  }

  const errMsg = !r1.ok ? (r1 as any).message : "Colis non trouvé chez Intigo";
  return { ok: false, error: errMsg };
}

/**
 * POST /api/orders/import-tracking
 * Importe une liste de codeBars/tracking depuis Colissimo, InstaDelivery ou Intigo.
 * Crée ou met à jour les commandes en base.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("orders:write");
    if (auth.response) return auth.response;

    const teamId = auth.user?.teamId;
    if (!teamId) {
      return NextResponse.json(
        { success: false, message: "Aucun workspace actif trouvé pour cet utilisateur." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { trackingNumbers, codes, codeBars, text } = body;
    const selectedProvider: ImportProvider =
      body.provider === "COLISSIMO" || body.provider === "INSTADELIVERY" || body.provider === "INTIGO"
        ? body.provider
        : "AUTO";
    
    let rawInput: string[] = [];
    if (Array.isArray(trackingNumbers)) rawInput = [...rawInput, ...trackingNumbers];
    if (Array.isArray(codes)) rawInput = [...rawInput, ...codes];
    if (Array.isArray(codeBars)) rawInput = [...rawInput, ...codeBars];
    if (typeof text === "string") rawInput = [...rawInput, ...parseTrackingCodes(text)];

    rawInput = rawInput.map(String);

    const rawCleaned = rawInput.map(normalizeTrackingCode).filter(Boolean);

    if (rawCleaned.length === 0) {
      return NextResponse.json({ success: false, message: "Aucun code fourni" }, { status: 400 });
    }

    const colissimoCodes: string[] = [];
    const instaCodes: string[] = [];
    const intigoCodes: string[] = [];
    const results = { created: 0, updated: 0, failed: 0, details: [] as any[] };

    for (const c of rawCleaned) {
      if (!isValidTrackingCode(c)) {
        results.failed++;
        results.details.push({ tracking: c, status: "FAILED", error: "Format invalide (attendu: 10 à 18 chiffres, ou code-barres Intigo ex: 8743434S8)" });
        continue;
      }
      const detected = detectTrackingProvider(c);

      if (selectedProvider === "COLISSIMO") {
        if (detected === "InstaDelivery" || detected === "Intigo") {
          results.failed++;
          results.details.push({ tracking: c, status: "FAILED", error: `Ce code semble être ${detected}. Choisissez ${detected} ou Auto-détection.` });
          continue;
        }
        colissimoCodes.push(c);
        continue;
      }

      if (selectedProvider === "INSTADELIVERY") {
        if (detected === "Colissimo" || detected === "Intigo") {
          results.failed++;
          results.details.push({ tracking: c, status: "FAILED", error: `Ce code semble être ${detected}. Choisissez ${detected} ou Auto-détection.` });
          continue;
        }
        instaCodes.push(c);
        continue;
      }

      if (selectedProvider === "INTIGO") {
        if (detected === "Colissimo" || detected === "InstaDelivery") {
          results.failed++;
          results.details.push({ tracking: c, status: "FAILED", error: `Ce code semble être ${detected}. Choisissez ${detected} ou Auto-détection.` });
          continue;
        }
        intigoCodes.push(c);
        continue;
      }

      // Mode AUTO
      if (detected === "Colissimo") {
        colissimoCodes.push(c);
      } else if (detected === "InstaDelivery") {
        instaCodes.push(c);
      } else if (detected === "Intigo") {
        intigoCodes.push(c);
      } else {
        // Fallback si non déterminé : si contient une lettre, orienter vers Intigo
        if (/[A-Z]/i.test(c)) {
          intigoCodes.push(c);
        } else {
          results.failed++;
          results.details.push({ tracking: c, status: "FAILED", error: "Prestataire non détecté pour ce format de code" });
        }
      }
    }

    if (colissimoCodes.length === 0 && instaCodes.length === 0 && intigoCodes.length === 0) {
      return NextResponse.json({
        success: true,
        message: results.failed > 0 ? "Tous les codes sont invalides" : "Aucun code détecté",
        results,
      });
    }

    console.log(`[import-tracking] Colissimo: ${colissimoCodes.length} | InstaDelivery: ${instaCodes.length} | Intigo: ${intigoCodes.length}`);

    // ── Colissimo ────────────────────────────────────────────────────────
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

    // ── InstaDelivery ────────────────────────────────────────────────────
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

    // ── Intigo ───────────────────────────────────────────────────────────
    if (intigoCodes.length > 0) {
      const config = await resolveIntigoConfig(teamId);
      if (!config) {
        results.failed += intigoCodes.length;
        intigoCodes.forEach(c => results.details.push({ tracking: c, error: "Intigo non configuré (clé API manquante)" }));
      } else {
        for (const tracking of intigoCodes) {
          try {
            const r = await fetchIntigoParcel(teamId, tracking);
            console.log(`[import-tracking] Intigo ${tracking}: ok=${r.ok} error=${r.error ?? "-"}`);
            if (!r.ok || !r.data) {
              results.failed++;
              results.details.push({ tracking, error: r.error || "Colis Intigo non trouvé" });
              continue;
            }
            const action = await upsertIntigoOrder(teamId, tracking, r.data);
            const rawStatus = codeOf(r.data);
            const statusLabel = intigoStatusLabel(rawStatus);
            if (action === "created") results.created++;
            else results.updated++;
            results.details.push({ tracking, status: statusLabel, action, provider: "INTIGO" });
          } catch (e) {
            results.failed++;
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error(`[import-tracking] Intigo ${tracking} exception:`, errMsg);
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

  const instaOpDate = parseOperationDate(colis.last_operation_date) || null;
  const instaCreatedAt = parseOperationDate(colis.created_at) || null;

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

// ── Upsert Intigo order ───────────────────────────────────────────────
async function upsertIntigoOrder(teamId: string, trackingInput: string, detail: any): Promise<"created" | "updated"> {
  const parcelObj = detail?.parcel ?? detail?.data ?? detail;
  const nid = String(parcelObj.nid ?? parcelObj.barcode ?? parcelObj.code_barre ?? trackingInput).trim();
  const cid = parcelObj.cid ?? parcelObj.reference ?? parcelObj.client_id ?? null;
  const recipientName = parcelObj.recipient_name ?? parcelObj.nom_destinataire ?? parcelObj.client ?? parcelObj.customer_name ?? "";
  const phone = parcelObj.phone1 ?? parcelObj.phone ?? parcelObj.tel1 ?? parcelObj.tel_destinataire ?? "";
  const address = parcelObj.destination_address ?? parcelObj.adresse_destinataire ?? parcelObj.address ?? "";
  const city = parcelObj.city_name ?? parcelObj.destination_city_name ?? (typeof parcelObj.destination_city === "string" ? parcelObj.destination_city : parcelObj.destination_city?.name) ?? parcelObj.ville ?? "";
  const price = parseFloat(parcelObj.price ?? parcelObj.cod_amount ?? parcelObj.codAmount ?? parcelObj.montant ?? "0") || 0;

  const rawCode = codeOf(parcelObj);
  const mappedStatus = mapIntigoStatusCode(rawCode);
  const statusLabel = intigoStatusLabel(rawCode);
  const isPaid = (mappedStatus === "DELIVERED" || mappedStatus === "PAID_DELIVERED") && price > 0;
  const isReturn = isReturnStatus(mappedStatus);

  const { getFinanceSettings, calculateOrderFinance } = await import("@/lib/finance");
  const settings = await getFinanceSettings(teamId, "INTIGO");
  const finance = calculateOrderFinance({
    totalAmount: price,
    status: mappedStatus,
    settings,
  });

  const existing = await prisma.order.findFirst({
    where: {
      teamId,
      shippingProvider: "INTIGO",
      OR: [
        { trackingNumber: trackingInput },
        { trackingNumber: nid },
        ...(cid ? [{ reference: cid }] : []),
      ],
    },
  });

  const intigoOpDate = parseOperationDate(parcelObj.updated_at || parcelObj.last_operation_date || parcelObj.delivered_at) || null;
  const intigoCreatedAt = parseOperationDate(parcelObj.created_at || parcelObj.date_creation) || null;
  const isDelivered = mappedStatus === "DELIVERED" || mappedStatus === "PAID_DELIVERED";
  const isPickedUp = mappedStatus === "PICKED_UP";

  let orderId = "";
  let action: "created" | "updated" = "created";

  if (existing) {
    orderId = existing.id;
    action = "updated";
    await prisma.order.update({
      where: { id: existing.id },
      data: {
        status: mappedStatus || existing.status,
        apiStatus: statusLabel || existing.apiStatus,
        customerName: recipientName || existing.customerName,
        customerPhone: phone || existing.customerPhone,
        shippingAddress: address || existing.shippingAddress,
        shippingCity: city || existing.shippingCity,
        revenue: price > 0 ? price : existing.revenue,
        validatedRevenue: finance.validatedRevenue,
        deliveryCostApplied: finance.deliveryCostApplied,
        returnCostApplied: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netProfit: finance.netProfit,
        operationDate: intigoOpDate ?? existing.operationDate,
        deliveredAt: isDelivered && intigoOpDate ? intigoOpDate : existing.deliveredAt,
        pickedUpAt: isPickedUp && intigoOpDate ? intigoOpDate : existing.pickedUpAt,
        importedAt: new Date(),
      },
    });
  } else {
    action = "created";
    const order = await prisma.order.create({
      data: {
        teamId,
        status: mappedStatus,
        revenue: price,
        cost: 0,
        profit: 0,
        validatedRevenue: finance.validatedRevenue,
        deliveryCostApplied: finance.deliveryCostApplied,
        returnCostApplied: finance.returnCostApplied,
        withholdingTaxApplied: finance.withholdingTaxApplied,
        netProfit: finance.netProfit,
        shippingProvider: "INTIGO",
        trackingNumber: trackingInput,
        reference: cid || undefined,
        customerName: recipientName || undefined,
        customerPhone: phone || undefined,
        shippingAddress: address || undefined,
        shippingCity: city || undefined,
        apiStatus: statusLabel,
        operationDate: intigoOpDate ?? undefined,
        deliveredAt: isDelivered && intigoOpDate ? intigoOpDate : undefined,
        pickedUpAt: isPickedUp && intigoOpDate ? intigoOpDate : undefined,
        date: intigoCreatedAt ?? new Date(),
        importedAt: new Date(),
      },
    });
    orderId = order.id;
  }

  // Mettre à jour ou créer la ligne IntigoParcel
  try {
    const codeNum = Number.isInteger(Number(rawCode)) ? Number(rawCode) : null;
    await (prisma as any).intigoParcel.upsert({
      where: { teamId_nid: { teamId, nid } },
      create: {
        teamId,
        orderId,
        nid,
        cid: cid || undefined,
        statusCode: codeNum,
        statusLabel,
        codAmount: price,
        recipientName: recipientName ? String(recipientName).slice(0, 200) : undefined,
        phone: phone ? String(phone).slice(0, 60) : undefined,
        rawDetail: parcelObj,
        lastSyncAt: new Date(),
      },
      update: {
        orderId,
        statusCode: codeNum,
        statusLabel,
        codAmount: price,
        recipientName: recipientName ? String(recipientName).slice(0, 200) : undefined,
        phone: phone ? String(phone).slice(0, 60) : undefined,
        rawDetail: parcelObj,
        lastSyncAt: new Date(),
      },
    });
  } catch (err) {
    console.warn("[import-tracking] Intigo parcel upsert warn:", err);
  }

  if (isReturn) await maybeCreateReturnStockMovement(orderId);
  await maybeUpsertRevenue(teamId, orderId, "INTIGO", trackingInput, cid, statusLabel, finance.validatedRevenue || price, finance.deliveryCostApplied, finance.returnCostApplied, finance.withholdingTaxApplied, null, isPaid && !isReturn, recipientName);
  await logIntigoHistory(teamId, { orderId, nid, action: "import", success: true, message: `${trackingInput} (${statusLabel})` });

  return action;
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

    await prisma.product.update({
      where: { id: order.productId },
      data: { stockQuantity: { increment: qty } },
    });

    console.log(`[import-tracking] Stock return movement created for order ${orderId}, qty=${qty}`);
  } catch (e) {
    console.error("[import-tracking] stock movement error:", e);
  }
}
