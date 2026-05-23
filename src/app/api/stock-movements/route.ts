import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

type MovementPayload = {
  productId?: string;
  quantity?: number;
  mode?: "IN" | "OUT";
  referenceNumber?: string;
  partnerName?: string;
};

export async function GET() {
  try {
    const movements = await prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        quantity: true,
        createdAt: true,
        product: { select: { name: true, sku: true } },
        purchaseInvoice: { select: { invoiceNumber: true, supplierName: true } },
        deliveryNote: { select: { noteNumber: true, companyName: true } },
      },
    });

    return NextResponse.json(movements);
  } catch {
    return NextResponse.json({ error: "Impossible de charger les mouvements." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MovementPayload;
    const productId = body.productId?.trim();
    const mode = body.mode;
    const referenceNumber = body.referenceNumber?.trim();
    const partnerName = body.partnerName?.trim();
    const quantity = Number(body.quantity);

    if (!productId || !referenceNumber || !partnerName || !Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Donnees invalides." }, { status: 400 });
    }

    if (mode !== "IN" && mode !== "OUT") {
      return NextResponse.json({ error: "Type de mouvement invalide." }, { status: 400 });
    }

    const teamId = await getOrCreateDefaultTeamId();

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, stockQuantity: true },
      });

      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      if (mode === "OUT" && product.stockQuantity < quantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: {
          stockQuantity: mode === "IN" ? { increment: quantity } : { decrement: quantity },
        },
        select: { id: true, stockQuantity: true },
      });

      if (mode === "IN") {
        const invoice = await tx.purchaseInvoice.upsert({
          where: { invoiceNumber: referenceNumber },
          update: { supplierName: partnerName },
          create: {
            invoiceNumber: referenceNumber,
            supplierName: partnerName,
            teamId,
          },
          select: { id: true },
        });

        await tx.stockMovement.create({
          data: {
            type: "IN",
            quantity,
            productId,
            purchaseInvoiceId: invoice.id,
          },
        });
      } else {
        const note = await tx.deliveryNote.upsert({
          where: { noteNumber: referenceNumber },
          update: { companyName: partnerName },
          create: {
            noteNumber: referenceNumber,
            companyName: partnerName,
            teamId,
          },
          select: { id: true },
        });

        await tx.stockMovement.create({
          data: {
            type: "OUT",
            quantity,
            productId,
            deliveryNoteId: note.id,
          },
        });
      }

      return updatedProduct;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json({ error: "Stock insuffisant pour cette sortie." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
    }
    return NextResponse.json({ error: "Impossible de traiter le mouvement." }, { status: 500 });
  }
}
