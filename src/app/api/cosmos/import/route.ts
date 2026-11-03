// src/app/api/cosmos/import/route.ts — Import et synchronisation en masse des commandes Cosmos Delivery.
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { resolveCosmosConfig } from "@/lib/cosmos-config";
import { listCosmosOrders, fetchCosmosOrderFullDetails } from "@/lib/cosmos-api";
import { mapCosmosStatus, cosmosStatusLabel } from "@/lib/cosmos-domain";
import { prisma } from "@/lib/prisma";
import { parseOperationDate } from "@/lib/date-utils";
import { isReturnStatus } from "@/lib/delivery-status";
import { normalizeTrackingCode, parseTrackingCodes, isValidTrackingCode } from "@/lib/tracking-utils";

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    if (!teamId) {
      return NextResponse.json({ success: false, message: "Workspace introuvable" }, { status: 400 });
    }

    const config = await resolveCosmosConfig(teamId);
    if (!config) {
      return NextResponse.json(
        { success: false, message: "Cosmos Delivery non configuré (token Bearer manquant)" },
        { status: 400 }
      );
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
    const settings = await getFinanceSettings(teamId, "COSMOS");

    // Traitement par lots de 50 pour interroger l'API Cosmos
    const batchSize = 50;
    for (let i = 0; i < rawCleaned.length; i += batchSize) {
      const batch = rawCleaned.slice(i, i + batchSize);
      const validBatch: string[] = [];

      for (const tracking of batch) {
        if (!isValidTrackingCode(tracking)) {
          results.failed++;
          results.details.push({
            tracking,
            codeBar: tracking,
            status: "FAILED",
            error: "Format code-barres invalide (attendu: 12 chiffres ou code alphanumérique)",
          });
        } else {
          validBatch.push(tracking);
        }
      }

      if (validBatch.length === 0) continue;

      // Interroger l'API Cosmos via le filtre barcode
      const apiRes = await listCosmosOrders(teamId, {
        barcode: validBatch.join(","),
        limit: validBatch.length,
      });

      const cosmosOrders = apiRes.ok && Array.isArray(apiRes.data?.data) ? apiRes.data.data : [];
      const cosmosMap = new Map<string, any>();

      for (const co of cosmosOrders) {
        if (co.barcode) cosmosMap.set(String(co.barcode).toUpperCase(), co);
        if (co.id) cosmosMap.set(String(co.id).toUpperCase(), co);
        if (co.integrationBarcode) cosmosMap.set(String(co.integrationBarcode).toUpperCase(), co);
        if (co.externalBarcode) cosmosMap.set(String(co.externalBarcode).toUpperCase(), co);
      }

      const barcodesToFetch = cosmosOrders.map((o) => o.barcode).filter(Boolean);
      const detailsMap = await fetchCosmosOrderFullDetails(teamId, barcodesToFetch);

      for (const tracking of validBatch) {
        const cosmosOrder = cosmosMap.get(tracking) || cosmosMap.get(tracking.padStart(12, "0"));

        if (!cosmosOrder) {
          results.failed++;
          results.details.push({
            tracking,
            codeBar: tracking,
            status: "FAILED",
            error: apiRes.ok ? "Colis non trouvé chez Cosmos Delivery" : (apiRes as any).message || "Erreur API Cosmos",
          });
          continue;
        }

        try {
          const barcode = String(cosmosOrder.barcode || cosmosOrder.id || tracking);
          const cosmosId = String(cosmosOrder.id || cosmosOrder.barcode || tracking);
          const details = detailsMap.get(barcode) || detailsMap.get(cosmosId);
          const name = details?.customerName || cosmosOrder.name || "";
          const phone = details?.customerPhone || cosmosOrder.phone || "";
          const address = details?.shippingAddress || cosmosOrder.address || "";
          const city = details?.shippingCity || cosmosOrder.city || "";
          const productName = details?.productName || cosmosOrder.content || "";
          const quantity = details?.quantity || Number(cosmosOrder.quantity) || 1;
          const totalAmount = details?.totalAmount || Number(cosmosOrder.totalAmount) || 0;
          const status = cosmosOrder.status || "pending";
          const paymentStatus = cosmosOrder.paymentStatus || "unpaid";
          const mappedStatus = mapCosmosStatus(status);
          const statusLabel = cosmosStatusLabel(status);
          const isReturn = isReturnStatus(mappedStatus);

          const finance = calculateOrderFinance({
            totalAmount,
            status: mappedStatus,
            settings,
          });

          const existing = await prisma.order.findFirst({
            where: {
              teamId,
              shippingProvider: "COSMOS",
              OR: [
                { trackingNumber: barcode },
                { trackingNumber: cosmosId },
                ...(cosmosOrder.externalBarcode ? [{ reference: cosmosOrder.externalBarcode }] : []),
                ...(cosmosOrder.integrationBarcode ? [{ reference: cosmosOrder.integrationBarcode }] : []),
              ],
            },
          });

          const opDate = parseOperationDate(cosmosOrder.updatedAt || cosmosOrder.createdAt) || null;
          const createdAt = parseOperationDate(cosmosOrder.createdAt) || null;
          const isDelivered = mappedStatus === "DELIVERED" || mappedStatus === "PAID_DELIVERED";
          const isPickedUp = mappedStatus === "PICKED_UP" || mappedStatus === "READY_FOR_PICKUP";

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
                customerName: name || existing.customerName,
                customerPhone: phone || existing.customerPhone,
                shippingAddress: address || existing.shippingAddress,
                shippingCity: city || existing.shippingCity,
                productName: productName || existing.productName,
                quantity: quantity || existing.quantity,
                revenue: totalAmount > 0 ? totalAmount : existing.revenue,
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
                revenue: totalAmount,
                cost: 0,
                profit: 0,
                validatedRevenue: finance.validatedRevenue,
                deliveryCostApplied: finance.deliveryCostApplied,
                returnCostApplied: finance.returnCostApplied,
                withholdingTaxApplied: finance.withholdingTaxApplied,
                netProfit: finance.netProfit,
                shippingProvider: "COSMOS",
                trackingNumber: barcode,
                reference: cosmosOrder.externalBarcode || cosmosOrder.integrationBarcode || undefined,
                customerName: name || "Client",
                customerPhone: phone || undefined,
                shippingAddress: address || undefined,
                shippingCity: city || undefined,
                productName: productName || undefined,
                quantity,
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

          // CosmosOrder upsert en DB
          try {
            await (prisma as any).cosmosOrder.upsert({
              where: { teamId_cosmosId: { teamId, cosmosId } },
              create: {
                teamId,
                orderId,
                cosmosId,
                barcode,
                name: name ? String(name).slice(0, 200) : undefined,
                phone: phone ? String(phone).slice(0, 60) : undefined,
                address: address ? String(address).slice(0, 300) : undefined,
                city: city ? String(city).slice(0, 100) : undefined,
                status,
                paymentStatus,
                totalAmount,
                quantity: Number(cosmosOrder.quantity) || 1,
                content: cosmosOrder.content ? String(cosmosOrder.content).slice(0, 500) : undefined,
                printed: Boolean(cosmosOrder.printed),
                externalBarcode: cosmosOrder.externalBarcode,
                integrationBarcode: cosmosOrder.integrationBarcode,
                labelUrl: cosmosOrder.labelUrl,
                labelPdfUrl: cosmosOrder.labelPdfUrl,
                rawDetail: cosmosOrder,
                lastSyncAt: new Date(),
              },
              update: {
                orderId,
                barcode,
                name: name ? String(name).slice(0, 200) : undefined,
                phone: phone ? String(phone).slice(0, 60) : undefined,
                address: address ? String(address).slice(0, 300) : undefined,
                city: city ? String(city).slice(0, 100) : undefined,
                status,
                paymentStatus,
                totalAmount,
                quantity: Number(cosmosOrder.quantity) || 1,
                content: cosmosOrder.content ? String(cosmosOrder.content).slice(0, 500) : undefined,
                printed: Boolean(cosmosOrder.printed),
                externalBarcode: cosmosOrder.externalBarcode,
                integrationBarcode: cosmosOrder.integrationBarcode,
                labelUrl: cosmosOrder.labelUrl,
                labelPdfUrl: cosmosOrder.labelPdfUrl,
                rawDetail: cosmosOrder,
                lastSyncAt: new Date(),
              },
            });
          } catch (coErr) {
            console.warn("[cosmos/import] cosmosOrder upsert warning:", coErr);
          }

          // Mouvement de stock si retour
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
              console.error("[cosmos/import] stock movement error:", smErr);
            }
          }

          results.details.push({
            tracking,
            codeBar: barcode,
            status: "SUCCESS",
            action,
            cosmosStatus: status,
            platformStatus: mappedStatus,
            paymentStatus,
            amount: totalAmount,
          });
        } catch (itemErr: any) {
          results.failed++;
          results.details.push({
            tracking,
            codeBar: tracking,
            status: "FAILED",
            error: itemErr?.message || "Erreur de traitement interne",
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Import Cosmos terminé : ${results.imported} importé(s), ${results.updated} mis à jour, ${results.failed} échec(s).`,
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Erreur serveur lors de l'import Cosmos" },
      { status: 500 }
    );
  }
}
