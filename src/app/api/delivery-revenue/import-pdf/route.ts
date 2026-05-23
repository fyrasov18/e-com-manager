import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { analyzePaymentPDF } from "@/lib/pdf-extractor";
import { extractText, getDocumentProxy } from "unpdf";

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const provider = (formData.get("provider") as string) || "COLISSIMO";

    if (!file) {
      return NextResponse.json({ error: "Fichier PDF requis" }, { status: 400 });
    }

    if (!file.type.includes("pdf")) {
      return NextResponse.json({ error: "Seuls les fichiers PDF sont acceptés" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10MB)" }, { status: 400 });
    }

    console.log("[PDF Import] File:", file.name, "| Provider:", provider, "| Size:", file.size);

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const trimmedText = text?.trim() || "";

    if (!trimmedText || trimmedText.length < 10) {
      return NextResponse.json({ error: "PDF illisible ou vide" }, { status: 400 });
    }

    console.log("[PDF Import] Extracted text length:", trimmedText.length);
    console.log("[PDF Import] Text preview:", trimmedText.substring(0, 300));

    const { payments, documentType, blocked, blockReason } = await analyzePaymentPDF(
      trimmedText,
      provider,
      file.name
    );

    // Blocked: wrong document type or no valid data
    if (blocked) {
      console.log("[PDF Import] Blocked:", blockReason);
      return NextResponse.json({
        success: false,
        blocked: true,
        documentType,
        blockReason,
        payments: [],
        count: 0,
        fileName: file.name,
      });
    }

    const validPayments = payments.filter((p) => p.amount !== null && p.amount > 0);
    const pendingPayments = payments.filter((p) => !p.amount || p.amount <= 0);

    console.log("[PDF Import] Valid payments:", validPayments.length, "| Pending manual:", pendingPayments.length);

    return NextResponse.json({
      success: true,
      blocked: false,
      documentType,
      payments,           // all (including ones with null amount for manual entry)
      validCount: validPayments.length,
      pendingCount: pendingPayments.length,
      count: payments.length,
      fileName: file.name,
    });
  } catch (err) {
    console.error("[PDF Import] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}