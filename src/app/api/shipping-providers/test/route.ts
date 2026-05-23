import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { providerId?: string };
    const providerId = body.providerId?.trim();

    if (!providerId) {
      return NextResponse.json({ error: "providerId manquant." }, { status: 400 });
    }

    const provider = await prisma.shippingProvider.findUnique({
      where: { id: providerId },
      select: { baseUrl: true, clientId: true, apiKey: true, name: true },
    });

    if (!provider) {
      return NextResponse.json({ error: "Societe introuvable." }, { status: 404 });
    }

    const canTestRemote = /^https?:\/\//.test(provider.baseUrl);
    if (!canTestRemote) {
      return NextResponse.json({ success: false, message: "URL API invalide." }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(provider.baseUrl, {
        method: "GET",
        headers: {
          "X-Client-Id": provider.clientId ?? "",
          "X-Api-Key": provider.apiKey,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      return NextResponse.json({
        success: res.ok,
        message: res.ok
          ? `Connexion API reussie pour ${provider.name}.`
          : `API joignable mais reponse ${res.status}.`,
      });
    } catch {
      clearTimeout(timeout);
      return NextResponse.json({
        success: false,
        message: "Connexion echouee (timeout, DNS ou API indisponible).",
      });
    }
  } catch {
    return NextResponse.json({ error: "Test API echoue." }, { status: 500 });
  }
}
