// src/app/api/cosmos/labels/route.ts — Proxy pour générer les bordereaux Cosmos en HTML ou PDF.
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { resolveCosmosConfig } from "@/lib/cosmos-config";

export async function GET(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const config = await resolveCosmosConfig(teamId);
    if (!config) {
      return NextResponse.json({ success: false, message: "Cosmos non configuré" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get("barcode");
    const format = searchParams.get("format") || "html";

    if (!barcode) {
      return NextResponse.json({ success: false, message: "Code(s) barre(s) requis" }, { status: 400 });
    }

    const cosmosUrl = `${config.baseUrl}/labels?barcode=${encodeURIComponent(barcode)}&format=${encodeURIComponent(format)}`;
    const res = await fetch(cosmosUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { success: false, message: `Erreur bordereau Cosmos (${res.status}): ${errText}` },
        { status: res.status }
      );
    }

    const contentType = res.headers.get("content-type") || (format === "pdf" ? "application/pdf" : "text/html");

    if (format === "pdf") {
      const arrayBuffer = await res.arrayBuffer();
      return new NextResponse(arrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="cosmos-labels-${barcode}.pdf"`,
        },
      });
    }

    const htmlText = await res.text();
    return new NextResponse(htmlText, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || "Erreur serveur" }, { status: 500 });
  }
}
