import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const supplierSchema = z.object({
  name: z.string().trim().min(1, "Le nom fournisseur est obligatoire.").max(160),
  phone: z.string().trim().max(60).optional().nullable(),
  email: z
    .string()
    .trim()
    .email("Email fournisseur invalide.")
    .optional()
    .or(z.literal(""))
    .nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

function cleanOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function GET() {
  const { user, response } = await requirePermission("products:read");

  if (response) return response;

  const teamId = user?.teamId;

  if (!teamId) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 400 });
  }

  const suppliers = await prisma.supplier.findMany({
    where: { teamId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      notes: true,
      createdAt: true,
      _count: {
        select: {
          products: true,
          purchaseInvoices: true,
        },
      },
    },
  });

  return NextResponse.json(suppliers);
}

export async function POST(req: Request) {
  const { user, response } = await requirePermission("products:write");

  if (response) return response;

  const teamId = user?.teamId;

  if (!teamId) {
    return NextResponse.json({ error: "Organisation introuvable." }, { status: 400 });
  }

  const payload = supplierSchema.safeParse(await req.json().catch(() => null));

  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.issues[0]?.message ?? "Donnees fournisseur invalides." },
      { status: 400 }
    );
  }

  try {
    const supplier = await prisma.supplier.create({
      data: {
        teamId,
        name: payload.data.name,
        phone: cleanOptional(payload.data.phone),
        email: cleanOptional(payload.data.email),
        address: cleanOptional(payload.data.address),
        notes: cleanOptional(payload.data.notes),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        createdAt: true,
      },
    });

    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ce fournisseur existe deja dans cette organisation." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Impossible de creer le fournisseur." },
      { status: 500 }
    );
  }
}
