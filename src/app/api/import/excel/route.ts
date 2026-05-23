import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { parseExcelBuffer } from "@/lib/excel-parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const result = await parseExcelBuffer(Buffer.from(buffer));

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Erreur lors de la lecture du fichier." }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Import] Excel error:", err);
    return NextResponse.json({ error: "Erreur lors de la lecture du fichier." }, { status: 500 });
  }
}