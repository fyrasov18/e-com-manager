import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

export async function GET() {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const providers = await prisma.shippingProvider.findMany({
      where: { teamId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        clientId: true,
        isActive: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(providers);
  } catch {
    return NextResponse.json({ error: "Impossible de charger les societes de livraison." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      baseUrl?: string;
      clientId?: string;
      apiKey?: string;
      isActive?: boolean;
    };

    const name = body.name?.trim();
    const baseUrl = body.baseUrl?.trim();
    const clientId = body.clientId?.trim() || null;
    const apiKey = body.apiKey?.trim();
    const isActive = body.isActive ?? true;

    if (!name || !baseUrl || !apiKey) {
      return NextResponse.json({ error: "Nom, URL API et cle API sont obligatoires." }, { status: 400 });
    }

    const teamId = await getOrCreateDefaultTeamId();

    const provider = await prisma.shippingProvider.upsert({
      where: { teamId_name: { teamId, name } },
      create: { name, baseUrl, clientId, apiKey, isActive, teamId },
      update: { baseUrl, clientId, apiKey, isActive },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        clientId: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(provider, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Impossible d'enregistrer la configuration API." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("id");

    if (!providerId) {
      return NextResponse.json({ error: "ID du provider requis." }, { status: 400 });
    }

    const teamId = await getOrCreateDefaultTeamId();

    const existing = await prisma.shippingProvider.findFirst({
      where: { id: providerId, teamId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Provider introuvable." }, { status: 404 });
    }

    await prisma.shippingProvider.delete({
      where: { id: providerId },
    });

    return NextResponse.json({ success: true, message: `${existing.name} a été supprimé.` });
  } catch {
    return NextResponse.json({ error: "Erreur lors de la suppression." }, { status: 500 });
  }
}
