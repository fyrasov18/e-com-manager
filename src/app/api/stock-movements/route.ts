import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const stockLineSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().nonnegative().optional().nullable(),
});

const purchaseInvoiceSchema = z.object({
  kind: z.literal("PURCHASE_INVOICE"),
  invoiceNumber: z.string().trim().min(1, "Numero facture obligatoire.").max(100),
  invoiceDate: z.string().trim().min(1, "Date facture obligatoire."),
  supplierId: z.string().trim().min(1, "Fournisseur obligatoire."),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(stockLineSchema).min(1, "Ajoutez au moins une ligne produit."),
});

const deliveryManifestSchema = z.object({
  kind: z.literal("DELIVERY_MANIFEST"),
  manifestNumber: z.string().trim().min(1, "Numero manifeste obligatoire.").max(100),
  manifestDate: z.string().trim().min(1, "Date manifeste obligatoire."),
  deliveryCompanyName: z.string().trim().min(1, "Societe de livraison obligatoire.").max(160),
  totalPackages: z.coerce.number().int().positive(),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(stockLineSchema.omit({ unitCost: true })).min(1, "Ajoutez au moins une ligne produit."),
});

const legacyMovementSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive(),
  mode: z.enum(["IN", "OUT"]),
  referenceNumber: z.string().trim().min(1),
  partnerName: z.string().trim().min(1),
});

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sumLineQuantities(lines: Array<{ quantity: number }>) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export async function GET() {
  const { user, response } = await requirePermission("products:read");

  if (response) return response;

  const teamId = user?.teamId;

  if (!teamId) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 400 });
  }

  try {
    const movements = await prisma.stockMovement.findMany({
      where: {
        product: { teamId },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        quantity: true,
        unitCost: true,
        notes: true,
        createdAt: true,
        product: { select: { name: true, sku: true } },
        purchaseInvoice: {
          select: {
            invoiceNumber: true,
            invoiceDate: true,
            supplierName: true,
            supplier: { select: { id: true, name: true } },
          },
        },
        deliveryNote: {
          select: {
            noteNumber: true,
            manifestDate: true,
            companyName: true,
            totalPackages: true,
          },
        },
      },
    });

    return NextResponse.json(movements);
  } catch {
    return NextResponse.json({ error: "Impossible de charger les mouvements." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { user, response } = await requirePermission("products:write");

  if (response) return response;

  const teamId = user?.teamId;

  if (!teamId) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 400 });
  }

  try {
    const body = await req.json();

    if (
      body &&
      typeof body === "object" &&
      "kind" in body &&
      body.kind === "PURCHASE_INVOICE"
    ) {
      const parsed = purchaseInvoiceSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Donnees facture invalides." },
          { status: 400 }
        );
      }

      const data = parsed.data;
      const invoiceDate = parseDate(data.invoiceDate);

      if (!invoiceDate) {
        return NextResponse.json({ error: "Date facture invalide." }, { status: 400 });
      }

      const result = await prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.findFirst({
          where: { id: data.supplierId, teamId },
          select: { id: true, name: true },
        });

        if (!supplier) {
          throw new Error("SUPPLIER_NOT_FOUND");
        }

        const products = await tx.product.findMany({
          where: {
            teamId,
            id: { in: data.lines.map((line) => line.productId) },
          },
          select: { id: true },
        });
        const productIds = new Set(products.map((product) => product.id));

        if (productIds.size !== new Set(data.lines.map((line) => line.productId)).size) {
          throw new Error("PRODUCT_NOT_FOUND");
        }

        const invoice = await tx.purchaseInvoice.upsert({
          where: {
            teamId_invoiceNumber: {
              teamId,
              invoiceNumber: data.invoiceNumber,
            },
          },
          update: {
            invoiceDate,
            supplierId: supplier.id,
            supplierName: supplier.name,
          },
          create: {
            teamId,
            invoiceNumber: data.invoiceNumber,
            invoiceDate,
            supplierId: supplier.id,
            supplierName: supplier.name,
          },
          select: { id: true },
        });

        const previousLines = await tx.stockMovement.findMany({
          where: { purchaseInvoiceId: invoice.id, type: "IN" },
          select: { productId: true, quantity: true },
        });

        for (const previousLine of previousLines) {
          await tx.product.update({
            where: { id: previousLine.productId },
            data: { stockQuantity: { decrement: previousLine.quantity } },
          });
        }

        await tx.stockMovement.deleteMany({
          where: { purchaseInvoiceId: invoice.id, type: "IN" },
        });

        for (const line of data.lines) {
          await tx.product.update({
            where: { id: line.productId },
            data: {
              stockQuantity: { increment: line.quantity },
              supplierId: supplier.id,
              supplierName: supplier.name,
            },
          });
          await tx.stockMovement.create({
            data: {
              type: "IN",
              status: "COMPLETED",
              quantity: line.quantity,
              productId: line.productId,
              purchaseInvoiceId: invoice.id,
              source: "PURCHASE_INVOICE",
              unitCost: line.unitCost ?? null,
              notes: data.notes?.trim() || null,
            },
          });
        }

        return { id: invoice.id, importedLines: data.lines.length };
      });

      return NextResponse.json(result, { status: 201 });
    }

    if (
      body &&
      typeof body === "object" &&
      "kind" in body &&
      body.kind === "DELIVERY_MANIFEST"
    ) {
      const parsed = deliveryManifestSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Donnees manifeste invalides." },
          { status: 400 }
        );
      }

      const data = parsed.data;
      const manifestDate = parseDate(data.manifestDate);

      if (!manifestDate) {
        return NextResponse.json({ error: "Date manifeste invalide." }, { status: 400 });
      }

      const linePackages = sumLineQuantities(data.lines);

      if (linePackages !== data.totalPackages) {
        return NextResponse.json(
          { error: "Le total des quantites produits doit correspondre au nombre de colis." },
          { status: 400 }
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const products = await tx.product.findMany({
          where: {
            teamId,
            id: { in: data.lines.map((line) => line.productId) },
          },
          select: { id: true, stockQuantity: true },
        });
        const productsById = new Map(products.map((product) => [product.id, product]));

        if (productsById.size !== new Set(data.lines.map((line) => line.productId)).size) {
          throw new Error("PRODUCT_NOT_FOUND");
        }

        for (const line of data.lines) {
          const product = productsById.get(line.productId);
          if (!product || product.stockQuantity < line.quantity) {
            throw new Error("INSUFFICIENT_STOCK");
          }
        }

        const manifest = await tx.deliveryNote.upsert({
          where: {
            teamId_noteNumber: {
              teamId,
              noteNumber: data.manifestNumber,
            },
          },
          update: {
            manifestDate,
            companyName: data.deliveryCompanyName,
            totalPackages: data.totalPackages,
          },
          create: {
            teamId,
            noteNumber: data.manifestNumber,
            manifestDate,
            companyName: data.deliveryCompanyName,
            totalPackages: data.totalPackages,
          },
          select: { id: true },
        });

        const previousLines = await tx.stockMovement.findMany({
          where: { deliveryNoteId: manifest.id, type: "OUT" },
          select: { productId: true, quantity: true },
        });

        for (const previousLine of previousLines) {
          await tx.product.update({
            where: { id: previousLine.productId },
            data: { stockQuantity: { increment: previousLine.quantity } },
          });
        }

        await tx.stockMovement.deleteMany({
          where: { deliveryNoteId: manifest.id, type: "OUT" },
        });

        const refreshedProducts = await tx.product.findMany({
          where: {
            teamId,
            id: { in: data.lines.map((line) => line.productId) },
          },
          select: { id: true, stockQuantity: true },
        });
        const refreshedProductsById = new Map(
          refreshedProducts.map((product) => [product.id, product])
        );

        for (const line of data.lines) {
          const product = refreshedProductsById.get(line.productId);
          if (!product || product.stockQuantity < line.quantity) {
            throw new Error("INSUFFICIENT_STOCK");
          }
        }

        for (const line of data.lines) {
          await tx.product.update({
            where: { id: line.productId },
            data: { stockQuantity: { decrement: line.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              type: "OUT",
              status: "COMPLETED",
              quantity: line.quantity,
              productId: line.productId,
              deliveryNoteId: manifest.id,
              source: "DELIVERY_MANIFEST",
              notes: data.notes?.trim() || null,
            },
          });
        }

        return { id: manifest.id, exportedLines: data.lines.length };
      });

      return NextResponse.json(result, { status: 201 });
    }

    const parsed = legacyMovementSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Donnees stock invalides." },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: data.productId, teamId },
        select: { id: true, stockQuantity: true },
      });

      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      if (data.mode === "OUT" && product.stockQuantity < data.quantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      const updatedProduct = await tx.product.update({
        where: { id: data.productId },
        data: {
          stockQuantity:
            data.mode === "IN"
              ? { increment: data.quantity }
              : { decrement: data.quantity },
        },
        select: { id: true, stockQuantity: true },
      });

      if (data.mode === "IN") {
        const invoice = await tx.purchaseInvoice.upsert({
          where: { teamId_invoiceNumber: { teamId, invoiceNumber: data.referenceNumber } },
          update: { supplierName: data.partnerName },
          create: {
            invoiceNumber: data.referenceNumber,
            supplierName: data.partnerName,
            teamId,
          },
          select: { id: true },
        });

        await tx.stockMovement.create({
          data: {
            type: "IN",
            status: "COMPLETED",
            quantity: data.quantity,
            productId: data.productId,
            purchaseInvoiceId: invoice.id,
            source: "MANUAL",
          },
        });
      } else {
        const note = await tx.deliveryNote.upsert({
          where: { teamId_noteNumber: { teamId, noteNumber: data.referenceNumber } },
          update: {
            companyName: data.partnerName,
            totalPackages: data.quantity,
          },
          create: {
            noteNumber: data.referenceNumber,
            companyName: data.partnerName,
            totalPackages: data.quantity,
            teamId,
          },
          select: { id: true },
        });

        await tx.stockMovement.create({
          data: {
            type: "OUT",
            status: "COMPLETED",
            quantity: data.quantity,
            productId: data.productId,
            deliveryNoteId: note.id,
            source: "MANUAL",
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
    if (error instanceof Error && error.message === "SUPPLIER_NOT_FOUND") {
      return NextResponse.json({ error: "Fournisseur introuvable." }, { status: 404 });
    }
    return NextResponse.json({ error: "Impossible de traiter le mouvement." }, { status: 500 });
  }
}
