import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { prisma } from "@/lib/prisma";
import { calculateWithholdingTax, getFinanceSettings } from "@/lib/finance";

export async function POST(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const body = await req.json();

    // ── Log complet du body reçu ──────────────────────────────────────────────
    console.log("[ConfirmImport] ===== RECEIVED BODY =====");
    console.log("[ConfirmImport] body:", JSON.stringify(body, null, 2));
    console.log("[ConfirmImport] teamId:", teamId);

    // provider peut venir soit au niveau root du body, soit dans chaque payment
    const rootProvider = body.provider as string | undefined;
    const { payments, source } = body as {
      payments: any[];
      source: string;
      provider?: string;
    };

    console.log("[ConfirmImport] rootProvider:", rootProvider);
    console.log("[ConfirmImport] payments count:", payments?.length ?? 0);
    console.log("[ConfirmImport] source:", source);

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      console.error("[ConfirmImport] VALIDATION FAILED: payments empty or not array");
      return NextResponse.json(
        { success: false, error: "Aucun paiement à importer", imported: 0, errors: [] },
        { status: 400 }
      );
    }

    let imported = 0;
    const errors: string[] = [];

    for (const p of payments) {
      console.log("[ConfirmImport] --- Processing payment ---");
      console.log("[ConfirmImport] raw payment:", JSON.stringify(p, null, 2));

      // ── Résolution du montant ─────────────────────────────────────────────
      // Le frontend envoie { ...p, amount: p.manualAmount ?? p.amount }
      // donc p.amount devrait déjà être la valeur finale
      let amount: number | null = null;
      if (typeof p.amount === "number" && p.amount > 0) {
        amount = p.amount;
      } else if (typeof p.manualAmount === "number" && p.manualAmount > 0) {
        amount = p.manualAmount;
      } else if (p.amount !== null && p.amount !== undefined) {
        const parsed = parseFloat(String(p.amount));
        if (!isNaN(parsed) && parsed > 0) amount = parsed;
      }

      console.log("[ConfirmImport] resolved amount:", amount, "(raw p.amount:", p.amount, ", p.manualAmount:", p.manualAmount, ")");

      if (amount === null || amount <= 0) {
        const id = p.trackingNumber || p.reference || p.paymentNumber || p.internalImportId || "?";
        const msg = `Montant invalide ou nul (${p.amount}) pour ${id} — skipped`;
        console.warn("[ConfirmImport] SKIPPED:", msg);
        errors.push(msg);
        continue;
      }

      // ── Provider ─────────────────────────────────────────────────────────
      // Priorité : root body > payment.provider
      const provider = String(rootProvider || p.provider || "UNKNOWN");
      const trackingNumber: string | null = p.trackingNumber || null;
      const reference: string | null = p.reference || null;
      const paymentNumber: string | null = p.paymentNumber || null;
      const internalImportId: string | null = p.internalImportId || null;

      console.log("[ConfirmImport] Processing:", {
        provider,
        trackingNumber,
        reference,
        paymentNumber,
        internalImportId,
        amount,
        source: source || "PDF_IMPORT",
        teamId,
      });

      // Vérifier qu'on a au moins un identifiant OU un internalImportId
      if (!trackingNumber && !reference && !paymentNumber && !internalImportId) {
        console.warn("[ConfirmImport] WARNING: No identifier — will create anyway with internalImportId fallback");
      }

      try {
        // ── Anti-doublon lookup ───────────────────────────────────────────
        let existing: any = null;

        if (trackingNumber) {
          existing = await prisma.deliveryRevenue.findFirst({
            where: { teamId, provider, trackingNumber },
          });
          console.log("[ConfirmImport] Dedup by trackingNumber:", existing?.id ?? "not found");
        }

        if (!existing && paymentNumber) {
          existing = await prisma.deliveryRevenue.findFirst({
            where: { teamId, provider, paymentNumber },
          });
          console.log("[ConfirmImport] Dedup by paymentNumber:", existing?.id ?? "not found");
        }

        if (!existing && reference && !reference.startsWith("IMP-") && !reference.startsWith("PDF-")) {
          existing = await prisma.deliveryRevenue.findFirst({
            where: { teamId, provider, reference },
          });
          console.log("[ConfirmImport] Dedup by reference:", existing?.id ?? "not found");
        }

        if (!existing && internalImportId) {
          existing = await prisma.deliveryRevenue.findFirst({
            where: {
              teamId,
              provider,
              rawData: { path: ["internalImportId"], equals: internalImportId },
            },
          });
          console.log("[ConfirmImport] Dedup by internalImportId:", existing?.id ?? "not found");
        }

        // ── Build data ────────────────────────────────────────────────────
        const financeSettings = await getFinanceSettings(teamId, provider);
        const withholdingTaxApplied = calculateWithholdingTax(
          amount,
          financeSettings.withholdingTaxPercent
        );

        const baseNetAmount =
          typeof p.netAmount === "number" && p.netAmount > 0
            ? p.netAmount
            : amount - (p.deliveryFee ?? 0) - (p.returnFee ?? 0);
        const netAmount = baseNetAmount - withholdingTaxApplied;

        const paymentDateRaw = p.paymentDate;
        let paymentDate: Date | null = null;
        if (paymentDateRaw) {
          try {
            const d = new Date(paymentDateRaw);
            if (!isNaN(d.getTime())) paymentDate = d;
          } catch { /* ignore */ }
        }

        const data = {
          source: source || "PDF_IMPORT",
          trackingNumber,
          reference,
          customerName: p.customerName || null,
          amount,
          deliveryFee: p.deliveryFee ?? 0,
          returnFee: p.returnFee ?? 0,
          withholdingTaxApplied,
          netAmount: netAmount > 0 ? netAmount : amount,
          paymentNumber,
          paymentDate,
          confidenceScore: p.confidence ?? p.confidenceScore ?? null,
          rawData: {
            extractionSource: p.extractionSource ?? "MANUAL",
            internalImportId,
            rawText: typeof p.rawText === "string" ? p.rawText.substring(0, 500) : null,
          },
        };

        if (existing) {
          // Ne jamais dégrader un paiement déjà validé
          const updateData: any = { ...data };
          if (existing.isValidated) {
            delete updateData.paymentStatus;
            delete updateData.isValidated;
          }
          await prisma.deliveryRevenue.update({
            where: { id: existing.id },
            data: updateData,
          });
          console.log("[ConfirmImport] UPDATED existing revenue:", existing.id, "amount:", amount);
        } else {
          const createData = {
            ...data,
            provider,
            // Prisma v7 : on ne peut pas passer teamId ET team: { connect } simultanément
            // Utiliser uniquement team: { connect }
            team: { connect: { id: teamId } },
            paymentStatus: "RECEIVED",
            isValidated: false,
            importedAt: new Date(),
          };
          console.log("[ConfirmImport] Creating new revenue with data:", JSON.stringify(createData, null, 2));
          const created = await prisma.deliveryRevenue.create({ data: createData });
          console.log("[ConfirmImport] CREATED new revenue — id:", created.id, "amount:", created.amount, "provider:", created.provider, "teamId:", created.teamId);
        }

        imported++;
      } catch (dbErr) {
        const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        const errStack = dbErr instanceof Error ? dbErr.stack : undefined;
        const id = trackingNumber || reference || paymentNumber || internalImportId || "?";
        const msg = `DB error for ${id}: ${errMsg}`;
        console.error("[ConfirmImport] DB ERROR:", msg);
        if (errStack) console.error("[ConfirmImport] Stack:", errStack);
        errors.push(msg);
      }
    }

    console.log("[ConfirmImport] ===== DONE =====");
    console.log("[ConfirmImport] imported:", imported, "| errors:", errors.length);
    if (errors.length > 0) console.log("[ConfirmImport] error details:", errors);

    // Vérifier en DB que les paiements ont bien été créés
    const totalInDB = await prisma.deliveryRevenue.count({ where: { teamId } });
    console.log("[ConfirmImport] Total DeliveryRevenue in DB for this team:", totalInDB);

    if (imported === 0 && errors.length === 0) {
      // Tous les payments ont été skipped (amounts nuls)
      return NextResponse.json({
        success: false,
        imported: 0,
        errors: ["Tous les paiements ont été ignorés — montants invalides ou nuls"],
        message: "Aucun paiement importé — vérifiez les montants.",
      }, { status: 422 });
    }

    return NextResponse.json({
      success: imported > 0,
      imported,
      errors,
      totalInDB,
      message:
        imported > 0
          ? `${imported} paiement(s) importé(s) avec succès.`
          : `Aucun paiement importé. Erreurs: ${errors.join("; ")}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur inconnue";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[ConfirmImport] FATAL ERROR:", msg);
    if (stack) console.error("[ConfirmImport] Stack:", stack);
    return NextResponse.json(
      { success: false, error: msg, imported: 0 },
      { status: 500 }
    );
  }
}
