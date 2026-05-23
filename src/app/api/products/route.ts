import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
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
      },
    });

    return NextResponse.json(products);
  } catch {
    return NextResponse.json({ error: "Impossible de charger les produits." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; sku?: string; supplierName?: string };
    const name = body.name?.trim();
    const sku = body.sku?.trim();
    const supplierName = body.supplierName?.trim() || null;

    if (!name || !sku) {
      return NextResponse.json({ error: "Nom et SKU sont obligatoires." }, { status: 400 });
    }

    const teamId = await getOrCreateDefaultTeamId();

    const product = await prisma.product.create({
      data: {
        name,
        sku,
        supplierName,
        margin: 0,
        teamId,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        supplierName: true,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Impossible de creer le produit." }, { status: 500 });
  }
}
