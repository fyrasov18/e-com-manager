import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const productSchema = z.object({
  name: z.string().trim().min(1, "Nom produit obligatoire.").max(180),
  sku: z.string().trim().min(1, "SKU obligatoire.").max(80),
  supplierId: z.string().trim().optional().nullable(),
  supplierName: z.string().trim().max(160).optional().nullable(),
});

export async function GET() {
  const { user, response } = await requirePermission("products:read");

  if (response) return response;

  const teamId = user?.teamId;

  if (!teamId) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 400 });
  }

  try {
    const products = await prisma.product.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        stockEnAttente: true,
        supplierName: true,
        revenue: true,
        margin: true,
        salesCount: true,
        supplier: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(products);
  } catch {
    return NextResponse.json({ error: "Impossible de charger les produits." }, { status: 500 });
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
    const parsed = productSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Donnees produit invalides." },
        { status: 400 }
      );
    }

    const supplierId = parsed.data.supplierId?.trim() || null;
    const supplier = supplierId
      ? await prisma.supplier.findFirst({
          where: { id: supplierId, teamId },
          select: { id: true, name: true },
        })
      : null;

    if (supplierId && !supplier) {
      return NextResponse.json({ error: "Fournisseur introuvable." }, { status: 404 });
    }

    const product = await prisma.product.create({
      data: {
        name: parsed.data.name,
        sku: parsed.data.sku,
        supplierId: supplier?.id ?? null,
        supplierName: supplier?.name ?? parsed.data.supplierName?.trim() ?? null,
        margin: 0,
        teamId,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        stockEnAttente: true,
        supplierName: true,
        supplier: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Impossible de creer le produit." }, { status: 500 });
  }
}
