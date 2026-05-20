// src/lib/stock.ts
// Service de gestion du stock — entrées fournisseur + sorties livraison

import { prisma } from "@/lib/prisma";

// ─── Entrée stock depuis facture fournisseur ──────────────────

export interface InvoiceLineInput {
  productName: string;
  productId?: string;   // Si produit existant
  quantity: number;
  unitPrice: number;
  // Création produit si inexistant
  newProduct?: {
    slug: string;
    price: number;      // Prix de vente
    categoryId: string;
  };
}

export async function processInvoice({
  supplierId,
  invoiceRef,
  invoiceDate,
  pdfUrl,
  notes,
  lines,
}: {
  supplierId: string;
  invoiceRef?: string;
  invoiceDate?: Date;
  pdfUrl?: string;
  notes?: string;
  lines: InvoiceLineInput[];
}) {
  const totalAmount = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  // Transaction : tout ou rien
  return await prisma.$transaction(async (tx) => {
    // 1. Créer la facture
    const invoice = await tx.purchaseInvoice.create({
      data: {
        supplierId,
        invoiceRef,
        invoiceDate: invoiceDate ?? new Date(),
        totalAmount,
        pdfUrl,
        notes,
      },
    });

    for (const line of lines) {
      let productId = line.productId;

      // 2. Créer le produit s'il n'existe pas
      if (!productId && line.newProduct) {
        const product = await tx.product.create({
          data: {
            name: line.productName,
            slug: line.newProduct.slug,
            price: line.newProduct.price,
            categoryId: line.newProduct.categoryId,
            stock: 0, // sera mis à jour juste après
          },
        });
        productId = product.id;
      }

      if (!productId) continue;

      // 3. Créer la ligne de facture
      await tx.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          productId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          totalPrice: line.quantity * line.unitPrice,
        },
      });

      // 4. Augmenter le stock
      await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: line.quantity } },
      });

      // 5. Enregistrer le mouvement de stock
      await tx.stockMovement.create({
        data: {
          productId,
          type: "IN",
          quantity: line.quantity,
          reason: `Facture ${invoiceRef ?? invoice.id}`,
          invoiceId: invoice.id,
        },
      });
    }

    return invoice;
  });
}

// ─── Sortie stock à l'expédition ─────────────────────────────

export async function deductStockOnShipment(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) throw new Error("Commande introuvable");

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      // Déduire le stock
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });

      // Enregistrer le mouvement
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: "OUT",
          quantity: item.quantity,
          reason: `Commande #${orderId.slice(-6).toUpperCase()} expédiée`,
          orderId,
        },
      });
    }
  });
}

// ─── Ajustement manuel ────────────────────────────────────────

export async function adjustStock(
  productId: string,
  quantity: number,
  reason: string
) {
  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
    });

    await tx.stockMovement.create({
      data: {
        productId,
        type: quantity > 0 ? "IN" : "ADJUST",
        quantity: Math.abs(quantity),
        reason,
      },
    });
  });
}
