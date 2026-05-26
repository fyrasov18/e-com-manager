import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { trackInstaDeliveryParcel, getInstaDeliveryConfig } from "@/lib/instavia-delivery";
import { syncOrderStock } from "@/lib/stock-sync";
import { normalizeTrackingCode, parseTrackingCodes } from "@/lib/tracking-utils";
import { calculateOrderFinance, getFinanceSettings } from "@/lib/finance";

const STATUS_MAP: Record<string, string> = {
  "en attente": "PENDING",
  "confirmé": "CONFIRMED",
  "en preparation": "PROCESSING",
  "expédié": "SHIPPED",
  "en cours de livraison": "OUT_FOR_DELIVERY",
  "livré": "DELIVERED",
  "livrée": "DELIVERED",
  "échoué": "FAILED_ATTEMPT",
  "retourné": "RETURNED",
  "annulé": "CANCELLED",
  "colis enlevé": "SHIPPED",
  "colis retour livré": "RETURN_DELIVERED",
  "retour planifié": "RETURN_PENDING",
};

function mapStatus(etat: string): string {
  const normalized = etat?.toLowerCase().trim() ?? "";
  return STATUS_MAP[normalized] ?? "UNKNOWN";
}

async function getTeamId(): Promise<string | null> {
  return getOrCreateDefaultTeamId();
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
    console.error("[InstaDelivery] updateOrderFinance error:", e);
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

    const body = await req.json();
    const { trackingNumbers, codes, text } = body;

    let rawInput: string[] = [];
    if (Array.isArray(trackingNumbers)) rawInput = [...rawInput, ...trackingNumbers];
    if (Array.isArray(codes)) rawInput = [...rawInput, ...codes];
    if (typeof text === "string") rawInput = [...rawInput, ...parseTrackingCodes(text)];

    rawInput = rawInput.map(String);
    const rawCleaned = rawInput.map(normalizeTrackingCode).filter(Boolean);

    if (rawCleaned.length === 0) {
      return NextResponse.json({ success: false, message: "Aucun code fourni" }, { status: 400 });
    }

    const results = {
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      details: [] as { tracking: string; status: string; error?: string; reason?: string; missingFields?: string[] }[],
    };

    for (const trackingNumber of rawCleaned) {
      const trimmed = trackingNumber;

      try {
        // trackInstaDeliveryParcel retourne { success, colis: InstaColisData | null, error? }
        const trackingResult = await trackInstaDeliveryParcel(trimmed, config.id);

        if (!trackingResult.success || !trackingResult.colis) {
          results.failed++;
          results.details.push({ tracking: trimmed, status: "FAILED", error: trackingResult.error ?? "Erreur API" });
          continue;
        }

        const colis = trackingResult.colis;
        // etat_str = label lisible, etat = code numérique
        const mappedStatus = mapStatus(colis.etat_str);

        const missingFields = [
          colis.nom_destinataire ? null : "nom",
          colis.tel_destinataire ? null : "tel",
          colis.adresse_destinataire ? null : "adresse",
        ].filter(Boolean) as string[];

        if (missingFields.length > 0) {
          results.skipped++;
          const reason = `Informations manquantes : ${missingFields.join(", ")}`;
          console.error(`[InstaDelivery] Import skipped for ${trimmed} - ${reason}`);
          results.details.push({
            tracking: trimmed,
            status: "SKIPPED",
            reason,
            missingFields,
          });
          continue;
        }

        const existingOrder = await prisma.order.findFirst({
          where: { trackingNumber: trimmed, teamId },
        });

        const revenue = parseFloat(colis.montant_reception ?? "0") || 0;

        const { pickOperationDate } = await import("@/lib/date-utils");
        const now = new Date();
        // operationDate : last_operation_date en priorité, PAS de fallback sur now
        const operationDate = pickOperationDate(colis) || existingOrder?.operationDate || null;
        const importedAt = now;

        let deliveredAt = existingOrder?.deliveredAt || undefined;
        let returnedAt = existingOrder?.returnedAt || undefined;

        // Mettre à jour deliveredAt / returnedAt seulement si on a une vraie date API
        if (operationDate) {
          if (mappedStatus === "DELIVERED") deliveredAt = operationDate;
          if (mappedStatus === "RETURNED" || mappedStatus === "RETURN_DELIVERED") returnedAt = operationDate;
        }

        if (existingOrder) {
          const oldStatus = existingOrder.status;
          await prisma.order.update({
            where: { id: existingOrder.id },
            data: {
              status: mappedStatus,
              customerName: colis.nom_destinataire || existingOrder.customerName,
              customerPhone: colis.tel_destinataire || existingOrder.customerPhone,
              shippingAddress: colis.adresse_destinataire || existingOrder.shippingAddress,
              revenue: revenue || existingOrder.revenue,
              operationDate,
              importedAt,
              deliveredAt,
              returnedAt,
            },
          });

          if (existingOrder.productId && mappedStatus !== oldStatus) {
            await syncOrderStock(existingOrder.id, mappedStatus, oldStatus);
          }

          await updateOrderFinance(teamId, existingOrder.id, "INSTADELIVERY", revenue || existingOrder.revenue, mappedStatus);

          results.updated++;
          results.details.push({ tracking: trimmed, status: mappedStatus });
        } else {
          const newOrder = await prisma.order.create({
            data: {
              teamId,
              status: mappedStatus,
              revenue,
              cost: 0,
              profit: 0,
              customerName: colis.nom_destinataire || "Inconnu",
              customerPhone: colis.tel_destinataire || "",
              shippingAddress: colis.adresse_destinataire || "",
              trackingNumber: trimmed,
              shippingProvider: "INSTAVIA_DELIVERY",
              operationDate,
              importedAt,
              deliveredAt,
              returnedAt,
            },
          });
          await updateOrderFinance(teamId, newOrder.id, "INSTADELIVERY", revenue, mappedStatus);
          results.imported++;
          results.details.push({ tracking: trimmed, status: mappedStatus });
        }
      } catch (err) {
        results.failed++;
        const errorMsg = err instanceof Error ? err.message : "Erreur";
        console.error(`Import error for ${trimmed}:`, err);
        results.details.push({ tracking: trimmed, status: "ERROR", error: errorMsg });
      }
    }

    let message = "";
    if (results.imported > 0) message += `${results.imported} importées, `;
    if (results.updated > 0) message += `${results.updated} mises à jour, `;
    if (results.skipped > 0) message += `${results.skipped} ignorées (données incomplètes), `;
    if (results.failed > 0) message += `${results.failed} échouées`;
    if (!message) message = "Aucune commande à traiter";

    return NextResponse.json({
      success: true,
      message: message.trim(),
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    console.error("Import commandes error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
