import { prisma } from "@/lib/prisma";
import { getInstaDeliveryConfig } from "./instavia-delivery";
import { getColissimoConfig } from "./colissimo";
import { getColis } from "./colissimo";
import { calculateOrderFinance, getFinanceSettings } from "./finance";

export interface DeliveryRevenueStats {
  totalRevenue: number;
  totalShipments: number;
  delivered: number;
  pending: number;
  cancelled: number;
  returned: number;
  totalReceived: number;
  totalValidated: number;
  ignored: number;
  ignoredReasons: Record<string, string[]>;
  configured: boolean;
  hasInstaDelivery: boolean;
  hasColissimo: boolean;
  error: string | null;
}

export interface DeliveryRevenueRow {
  id: string;
  provider: string;
  trackingNumber: string | null;
  reference: string;
  amount: number;
  deliveryFee: number;
  returnFee: number;
  withholdingTaxApplied: number;
  apiStatus: string | null;
  paymentNumber: string | null;
  paymentStatus: string | null;
  isValidated: boolean;
  importedAt: Date;
  validatedAt: Date | null;
}

export async function getActiveProviders(teamId: string): Promise<{
  instaDelivery: boolean;
  colissimo: boolean;
}> {
  const [instaConfig, colissimoConfig] = await Promise.all([
    getInstaDeliveryConfig(teamId),
    getColissimoConfig(teamId),
  ]);

  return {
    instaDelivery: !!instaConfig,
    colissimo: !!colissimoConfig,
  };
}

function isColissimoPaymentReceived(d: any): boolean {
  const status = String(d.etat ?? d.mappedStatus ?? "").toLowerCase();
  const hasPaymentNumber = Boolean(d.numPaiement);
  const hasPaidStatus =
    status === "livré payé" ||
    status.includes("payé") ||
    status.includes("paye") ||
    status.includes("paid");

  return hasPaymentNumber || hasPaidStatus;
}

export async function syncColissimoRevenue(teamId: string): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> {
  const config = await getColissimoConfig(teamId);
  if (!config) {
    return { success: 0, failed: 0, errors: ["Colissimo non configuré"] };
  }
  const financeSettings = await getFinanceSettings(teamId, "COLISSIMO");

  const ordersWithTracking = await prisma.order.findMany({
    where: {
      teamId,
      shippingProvider: "COLISSIMO_TN",
      trackingNumber: { not: null },
    },
    select: { id: true, trackingNumber: true },
  });

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const order of ordersWithTracking) {
    if (!order.trackingNumber) continue;

    try {
      // getColisDetails utilise POST et retourne prix/frais/client complets
      const { getColisDetails } = await import("./colissimo");
      const result = await getColisDetails(teamId, order.trackingNumber);

      if (result.success && result.details) {
        const d = result.details;
        const finance = calculateOrderFinance({
          totalAmount: d.prix || 0,
          status: d.mappedStatus || d.etat,
          settings: financeSettings,
        });
        const paymentStatus = isColissimoPaymentReceived(d) ? "RECEIVED" : "PENDING";

        console.log("[DeliveryRevenue] Colissimo sync", {
          provider: "COLISSIMO",
          trackingNumber: order.trackingNumber,
          apiStatus: d.etat,
          paymentNumber: d.numPaiement,
          amount: d.prix,
          decision: paymentStatus,
        });

        const existing = await prisma.deliveryRevenue.findFirst({
          where: { teamId, provider: "COLISSIMO", trackingNumber: order.trackingNumber },
        });

        if (existing) {
          await prisma.deliveryRevenue.update({
            where: { id: existing.id },
            data: {
              apiStatus: d.etat,
              paymentStatus: existing.isValidated ? "VALIDATED" : paymentStatus,
              ...(d.prix > 0 && { amount: d.prix }),
              ...(d.fraisLivraison > 0 && { deliveryFee: d.fraisLivraison }),
              ...(d.fraisRetour > 0 && { returnFee: d.fraisRetour }),
              withholdingTaxApplied: finance.withholdingTaxApplied,
              ...(d.numPaiement && { paymentNumber: d.numPaiement }),
              ...(d.client && { customerName: d.client }),
            },
          });
        } else {
          await prisma.deliveryRevenue.create({
            data: {
              provider: "COLISSIMO",
              team: { connect: { id: teamId } },
              order: { connect: { id: order.id } },
              trackingNumber: order.trackingNumber,
              reference: d.reference || null,
              customerName: d.client || null,
              amount: d.prix,
              deliveryFee: d.fraisLivraison,
              returnFee: d.fraisRetour,
              withholdingTaxApplied: finance.withholdingTaxApplied,
              netAmount: d.prix - d.fraisLivraison - d.fraisRetour - finance.withholdingTaxApplied,
              apiStatus: d.etat,
              paymentNumber: d.numPaiement,
              paymentStatus,
              isValidated: false,
            },
          });
        }

        success++;
      } else {
        failed++;
        errors.push(`${order.trackingNumber}: ${result.error}`);
      }
    } catch (err) {
      failed++;
      errors.push(
        `${order.trackingNumber}: ${err instanceof Error ? err.message : "Erreur"}`
      );
    }
  }

  return { success, failed, errors };
}

export async function getDeliveryRevenueByProvider(
  teamId: string,
  provider: "INSTADELIVERY" | "COLISSIMO"
): Promise<DeliveryRevenueRow[]> {
  return prisma.deliveryRevenue.findMany({
    where: { teamId, provider },
    orderBy: { importedAt: "desc" },
  }) as Promise<DeliveryRevenueRow[]>;
}

export async function getAllDeliveryRevenues(
  teamId: string
): Promise<DeliveryRevenueRow[]> {
  return prisma.deliveryRevenue.findMany({
    where: { teamId },
    orderBy: { importedAt: "desc" },
  }) as Promise<DeliveryRevenueRow[]>;
}

export async function getDeliveryRevenueStats(
  teamId: string
): Promise<DeliveryRevenueStats> {
  const { instaDelivery, colissimo } = await getActiveProviders(teamId);

  // Always compute stats — even without active providers, show PDF-imported revenues
  const revenues = await prisma.deliveryRevenue.findMany({
    where: { teamId },
  });

  let totalRevenue = 0;
  let delivered = 0;
  let pending = 0;
  let cancelled = 0;
  let returned = 0;
  let totalReceived = 0;   // count of RECEIVED payments
  let totalValidated = 0;

  for (const rev of revenues) {
    const status = rev.apiStatus?.toLowerCase().trim() ?? "";
    const paymentStatus = rev.paymentStatus?.toLowerCase().trim() ?? "";
    const amount = rev.amount;
    const isReceived = paymentStatus === "received" || paymentStatus === "recu";
    const isValidated = rev.isValidated;

    // Only validated payments count toward revenue
    if (isValidated) {
      totalValidated++;
      totalRevenue += amount;
    }

    if (isReceived || paymentStatus === "validated") {
      delivered++;
    } else if (paymentStatus === "pending" || status.includes("attente") || status.includes("cours")) {
      pending++;
    } else if (paymentStatus === "rejected" || status.includes("annulé") || status.includes("cancelled")) {
      cancelled++;
    } else if (status.includes("retour") || status.includes("returned")) {
      returned++;
    } else {
      pending++;
    }

    if (isReceived) {
      totalReceived++;  // count, not sum
    }
  }

  const configured = instaDelivery || colissimo || revenues.length > 0;

  return {
    totalRevenue,
    totalShipments: revenues.length,
    delivered,
    pending,
    cancelled,
    returned,
    totalReceived,
    totalValidated,
    ignored: 0,
    ignoredReasons: {},
    configured,
    hasInstaDelivery: instaDelivery,
    hasColissimo: colissimo,
    error: !configured ? "Aucune société de livraison configurée." : null,
  };
}

export async function validateDeliveryRevenue(
  teamId: string,
  revenueId: string
): Promise<{ success: boolean; message: string }> {
  try {
    await prisma.deliveryRevenue.update({
      where: { id: revenueId },
      data: {
        isValidated: true,
        validatedAt: new Date(),
      },
    });
    return { success: true, message: "Revenu validé." };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Erreur lors de la validation.",
    };
  }
}

export async function deleteDeliveryRevenue(
  teamId: string,
  revenueId: string
): Promise<{ success: boolean; message: string }> {
  try {
    await prisma.deliveryRevenue.delete({
      where: { id: revenueId },
    });
    return { success: true, message: "Revenu supprimé." };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Erreur lors de la suppression.",
    };
  }
}

export async function resyncDeliveryRevenue(
  teamId: string,
  revenueId: string
): Promise<{ success: boolean; message: string }> {
  const revenue = await prisma.deliveryRevenue.findFirst({
    where: { id: revenueId, teamId },
  });

  if (!revenue) {
    return { success: false, message: "Revenu non trouvé." };
  }

  if (revenue.provider === "COLISSIMO" && revenue.trackingNumber) {
    try {
      const { getColisDetails } = await import("./colissimo");
      const result = await getColisDetails(teamId, revenue.trackingNumber);

      if (result.success && result.details) {
        const d = result.details;
        const financeSettings = await getFinanceSettings(teamId, "COLISSIMO");
        const finance = calculateOrderFinance({
          totalAmount: d.prix || revenue.amount || 0,
          status: d.mappedStatus || d.etat,
          settings: financeSettings,
        });
        const isPaymentReceived =
          d.etat === "Livré Payé" ||
          d.mappedStatus === "PAID_DELIVERED" ||
          !!d.numPaiement;

        const paymentStatus = revenue.isValidated
          ? "VALIDATED"
          : isPaymentReceived
          ? "RECEIVED"
          : "PENDING";

        await prisma.$transaction(async (tx) => {
          await tx.deliveryRevenue.update({
            where: { id: revenueId },
            data: {
              apiStatus: d.etat,
              paymentStatus,
              ...(d.prix > 0 && { amount: d.prix }),
              ...(d.fraisLivraison > 0 && { deliveryFee: d.fraisLivraison }),
              ...(d.fraisRetour > 0 && { returnFee: d.fraisRetour }),
              withholdingTaxApplied: finance.withholdingTaxApplied,
              netAmount: finance.netProfit,
              ...(d.numPaiement && { paymentNumber: d.numPaiement }),
              ...(d.client && { customerName: d.client }),
            },
          });

          if (revenue.orderId) {
            await tx.order.update({
              where: { id: revenue.orderId },
              data: {
                apiStatus: d.etat,
                ...(d.prix > 0 && { revenue: d.prix }),
                validatedRevenue: finance.validatedRevenue,
                deliveryCostApplied: finance.deliveryCostApplied,
                returnCostApplied: finance.returnCostApplied,
                withholdingTaxApplied: finance.withholdingTaxApplied,
                netProfit: finance.netProfit,
                ...(d.numPaiement && { paymentNumber: d.numPaiement }),
              }
            });
          }
        });

        return { success: true, message: `Resynchronisé — Statut: ${d.etat}` };
      }

      return { success: false, message: result.error || "Erreur lors de la synchronisation." };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Erreur réseau.",
      };
    }
  }

  if (revenue.provider === "INSTADELIVERY" && revenue.trackingNumber) {
    try {
      const { trackInstaDeliveryParcel } = await import("./instavia-delivery");
      const result = await trackInstaDeliveryParcel(revenue.trackingNumber);

      if (result.success && result.colis) {
        const colis = result.colis;
        const amount = parseFloat(colis.montant_reception ?? "0");
        
        await prisma.$transaction(async (tx) => {
          await tx.deliveryRevenue.update({
            where: { id: revenueId },
            data: {
              apiStatus: colis.etat_str,
              ...(amount > 0 && { amount }),
            },
          });

          if (revenue.orderId) {
            await tx.order.update({
              where: { id: revenue.orderId },
              data: {
                apiStatus: colis.etat_str,
                ...(amount > 0 && { revenue: amount }),
              }
            });
          }
        });

        return { success: true, message: `Resynchronisé — Statut: ${colis.etat_str}` };
      }

      return { success: false, message: result.error || "Erreur tracking InstaDelivery." };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Erreur réseau.",
      };
    }
  }


  return { success: false, message: "Provider non supporté ou tracking manquant." };
}
