import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { resolveIntigoConfig } from "@/lib/intigo-config";
import { getParcel } from "@/lib/intigo-parcels";
import { mapIntigoStatusCode, intigoStatusLabel, logIntigoHistory } from "@/lib/intigo-domain";
import { prisma } from "@/lib/prisma";
import { parseOperationDate } from "@/lib/date-utils";
import { isReturnStatus } from "@/lib/delivery-status";
import { normalizeTrackingCode, parseTrackingCodes, isValidTrackingCode } from "@/lib/tracking-utils";

function codeOf(detail: any): string | null {
  const c = [detail?.status, detail?.status_code, detail?.statusCode, detail?.state, detail?.etat, detail?.parcel?.status];
  for (const x of c) if (x !== undefined && x !== null && String(x).trim() !== "") return String(x).trim();
  return null;
}

async function fetchIntigoParcel(teamId: string, tracking: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  // Tentative directe avec le code-barres complet (ex: 8743434S8)
  const r1 = await getParcel(teamId, tracking);
  if (r1.ok && (r1 as any).data) {
    return { ok: true, data: (r1 as any).data };
  }

  // Si 404, repli sur le NID numérique (ex: 8743434 sans le suffixe S8)
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

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    if (!teamId) {
      return NextResponse.json({ success: false, message: "Workspace introuvable" }, { status: 400 });
    }

    const config = await resolveIntigoConfig(teamId);
    if (!config) {
      return NextResponse.json({ success: false, message: "Intigo non configuré (clé API manquante)" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { trackingNumbers, codes, codeBars, text } = body;

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

    const results = {
      imported: 0,
      updated: 0,
      failed: 0,
      details: [] as any[],
    };

    const { getFinanceSettings, calculateOrderFinance } = await import("@/lib/finance");
    const settings = await getFinanceSettings(teamId, "INTIGO");

    for (const tracking of rawCleaned) {
      if (!isValidTrackingCode(tracking)) {
        results.failed++;
        results.details.push({
          tracking,
          codeBar: tracking,
          status: "FAILED",
          error: "Format code-barres invalide (ex attendu: 8743434S8)",
        });
        continue;
      }

      try {
        const r = await fetchIntigoParcel(teamId, tracking);
        if (!r.ok || !r.data) {
          results.failed++;
          results.details.push({
            tracking,
            codeBar: tracking,
            status: "FAILED",
            error: r.error || "Colis non trouvé",
          });
          continue;
        }

        const parcelObj = r.data?.parcel ?? r.data?.data ?? r.data;
        const nid = String(parcelObj.nid ?? parcelObj.barcode ?? parcelObj.code_barre ?? tracking).trim();
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
              { trackingNumber: tracking },
              { trackingNumber: nid },
              ...(cid ? [{ reference: cid }] : []),
            ],
          },
        });

        const opDate = parseOperationDate(parcelObj.updated_at || parcelObj.last_operation_date || parcelObj.delivered_at) || null;
        const createdAt = parseOperationDate(parcelObj.created_at || parcelObj.date_creation) || null;
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
              operationDate: opDate ?? existing.operationDate,
              deliveredAt: isDelivered && opDate ? opDate : existing.deliveredAt,
              pickedUpAt: isPickedUp && opDate ? opDate : existing.pickedUpAt,
              importedAt: new Date(),
            },
          });
          results.updated++;
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
              trackingNumber: tracking,
              reference: cid || undefined,
              customerName: recipientName || undefined,
              customerPhone: phone || undefined,
              shippingAddress: address || undefined,
              shippingCity: city || undefined,
              apiStatus: statusLabel,
              operationDate: opDate ?? undefined,
              deliveredAt: isDelivered && opDate ? opDate : undefined,
              pickedUpAt: isPickedUp && opDate ? opDate : undefined,
              date: createdAt ?? new Date(),
              importedAt: new Date(),
            },
          });
          orderId = order.id;
          results.imported++;
        }

        // IntigoParcel upsert
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
        } catch (pErr) {
          console.warn("[intigo/import] parcel upsert warning:", pErr);
        }

        // Mouvement de stock retour si applicable
        if (isReturn) {
          try {
            const order = await prisma.order.findUnique({ where: { id: orderId } });
            if (order?.productId) {
              const existingMove = await prisma.stockMovement.findFirst({
                where: { orderId, type: "IN", source: "RETURN_DELIVERED" },
              });
              if (!existingMove) {
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
              }
            }
          } catch (smErr) {
            console.error("[intigo/import] stock movement error:", smErr);
          }
        }

        // Delivery Revenue upsert
        try {
          const existingRev = await prisma.deliveryRevenue.findFirst({
            where: {
              teamId,
              provider: "INTIGO",
              OR: [{ trackingNumber: tracking }, { trackingNumber: nid }],
            },
          });
          const deliveryFee = finance.deliveryCostApplied;
          const returnFee = finance.returnCostApplied;
          const withholdingTaxApplied = finance.withholdingTaxApplied;
          const netAmount = price > 0 ? (price - deliveryFee - returnFee - withholdingTaxApplied) : -(deliveryFee + returnFee + withholdingTaxApplied);

          if (existingRev) {
            await prisma.deliveryRevenue.update({
              where: { id: existingRev.id },
              data: {
                orderId,
                apiStatus: statusLabel,
                paymentStatus: isPaid ? "RECEIVED" : existingRev.paymentStatus,
                ...(price > 0 && { amount: price }),
                withholdingTaxApplied,
              },
            });
          } else {
            await prisma.deliveryRevenue.create({
              data: {
                team: { connect: { id: teamId } },
                provider: "INTIGO",
                source: "API_SYNC",
                order: { connect: { id: orderId } },
                trackingNumber: tracking,
                reference: cid || undefined,
                customerName: recipientName || undefined,
                amount: price,
                deliveryFee,
                returnFee,
                withholdingTaxApplied,
                netAmount,
                apiStatus: statusLabel,
                paymentStatus: isPaid ? "RECEIVED" : "PENDING",
                isValidated: false,
              },
            });
          }
        } catch (revErr) {
          console.error("[intigo/import] revenue error:", revErr);
        }

        await logIntigoHistory(teamId, { orderId, nid, action: "import", success: true, message: `${tracking} (${statusLabel})` });

        results.details.push({
          tracking,
          codeBar: tracking,
          status: statusLabel,
          action,
          provider: "INTIGO",
        });
      } catch (err: any) {
        results.failed++;
        results.details.push({
          tracking,
          codeBar: tracking,
          status: "FAILED",
          error: err?.message || "Erreur de traitement",
        });
      }
    }

    const parts = [];
    if (results.imported) parts.push(`${results.imported} importées`);
    if (results.updated) parts.push(`${results.updated} mises à jour`);
    if (results.failed) parts.push(`${results.failed} erreurs`);

    return NextResponse.json({
      success: true,
      message: parts.join(", ") || "Aucun code traité",
      results,
    });
  } catch (e: any) {
    console.error("[intigo/import] fatal:", e);
    return NextResponse.json({ success: false, message: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
