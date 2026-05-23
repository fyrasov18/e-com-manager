import { prisma } from "@/lib/prisma";

export type StockMovementType = "IN" | "OUT" | "PENDING";
export type StockMovementStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export interface StockMovementResult {
  success: boolean;
  message: string;
  movementId?: string;
}

const SHIPPED_STATUSES = ["SHIPPED", "OUT_FOR_DELIVERY", "Colis enlevé", "expédié"];
const DELIVERED_STATUSES = ["DELIVERED", "DELIVERED_CLOSED", "PAID_DELIVERED", "EXCHANGE_DELIVERED", "livré"];
const RETURN_PENDING_STATUSES = ["RETURN_PENDING", "Retour planifié"];
const RETURN_DELIVERED_STATUSES = ["RETURN_DELIVERED", "Colis Retour livré", "retourné"];

export async function syncOrderStock(
  orderId: string,
  newStatus: string,
  oldStatus?: string
): Promise<StockMovementResult> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId },
      include: { product: true },
    });

    if (!order) {
      return { success: false, message: "Commande non trouvée" };
    }

    if (!order.productId || !order.product) {
      return { success: false, message: "Aucun produit lié à cette commande" };
    }

    const quantity = order.quantity || 1;
    const normalizedNewStatus = newStatus.toLowerCase().trim();
    const normalizedOldStatus = oldStatus?.toLowerCase().trim() || "";

    const wasShipped = SHIPPED_STATUSES.some((s) => normalizedOldStatus.includes(s.toLowerCase()));
    const wasDelivered = DELIVERED_STATUSES.some((s) => normalizedOldStatus.includes(s.toLowerCase()));
    const wasReturnPending = RETURN_PENDING_STATUSES.some((s) => normalizedOldStatus.includes(s.toLowerCase()));
    const wasReturnDelivered = RETURN_DELIVERED_STATUSES.some((s) => normalizedOldStatus.includes(s.toLowerCase()));
    
    const isShipped = SHIPPED_STATUSES.some((s) => normalizedNewStatus.includes(s.toLowerCase()));
    const isDelivered = DELIVERED_STATUSES.some((s) => normalizedNewStatus.includes(s.toLowerCase()));
    const isReturnPending = RETURN_PENDING_STATUSES.some((s) => normalizedNewStatus.includes(s.toLowerCase()));
    const isReturnDelivered = RETURN_DELIVERED_STATUSES.some((s) => normalizedNewStatus.includes(s.toLowerCase()));

    let type: StockMovementType | null = null;
    let status: StockMovementStatus = "PENDING";
    let note = "";

    if (isShipped && !wasShipped) {
      type = "OUT";
      status = "COMPLETED";
      note = "Sortie stock - Colis enlevé";
    } else if (isDelivered && !wasDelivered) {
      type = "IN";
      status = "COMPLETED";
      note = "Entrée stock - Commande livrée";
    } else if (isReturnPending && !wasReturnPending) {
      type = "PENDING";
      status = "PENDING";
      note = "Stock en attente - Retour planifié";
    } else if (isReturnDelivered && !wasReturnDelivered) {
      type = "IN";
      status = "COMPLETED";
      note = "Retour stock - Retour livré";
    }

    if (!type) {
      return { success: true, message: "Aucun mouvement de stock nécessaire pour ce changement" };
    }

    const existingMovement = await prisma.stockMovement.findFirst({
      where: {
        orderId: order.id,
        type,
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingMovement) {
      console.log(`[Stock] Movement already exists for order ${orderId}, type ${type}`);
      return { success: true, message: "Mouvement de stock déjà appliqué" };
    }

    const product = await prisma.product.findFirst({
      where: { id: order.productId },
    });

    if (!product) {
      return { success: false, message: "Produit non trouvé" };
    }

    if (type === "OUT") {
      const newStock = product.stockQuantity - quantity;
      if (newStock < 0) {
        return { success: false, message: `Stock insuffisant. Disponible: ${product.stockQuantity}, requis: ${quantity}` };
      }
      await prisma.product.update({
        where: { id: product.id },
        data: { stockQuantity: newStock },
      });
    } else if (type === "IN") {
      await prisma.product.update({
        where: { id: product.id },
        data: { stockQuantity: product.stockQuantity + quantity },
      });
    } else if (type === "PENDING") {
      await prisma.product.update({
        where: { id: product.id },
        data: { stockEnAttente: product.stockEnAttente + quantity },
      });
    }

    const movement = await prisma.stockMovement.create({
      data: {
        productId: product.id,
        quantity,
        type,
        status,
        orderId: order.id,
        source: "ORDER",
      },
    });

    console.log(`[Stock] Movement created: ${movement.id} - ${type} ${quantity} for product ${product.id}`);
    return {
      success: true,
      message: note,
      movementId: movement.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[Stock] syncOrderStock error:", err);
    return { success: false, message };
  }
}

export async function getProductStockInfo(productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId },
    include: {
      stockMovements: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!product) return null;

  const movements = await prisma.stockMovement.groupBy({
    by: ["type"],
    where: { productId },
    _sum: { quantity: true },
  });

  const stockIn = movements.find((m) => m.type === "IN")?._sum.quantity || 0;
  const stockOut = movements.find((m) => m.type === "OUT")?._sum.quantity || 0;
  const stockPending = movements.find((m) => m.type === "PENDING")?._sum.quantity || 0;

  return {
    ...product,
    totalIn: stockIn,
    totalOut: stockOut,
    totalPending: stockPending,
    calculatedStock: stockIn - stockOut,
  };
}
