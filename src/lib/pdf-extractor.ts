import { prisma } from "@/lib/prisma";
import { calculateWithholdingTax, getFinanceSettings } from "@/lib/finance";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentType = "PAYMENT_RECEIPT" | "DELIVERY_SLIP" | "MANIFEST" | "UNKNOWN";
export type ExtractionSource = "LOCAL" | "GOOGLE_AI" | "MANUAL";

export interface ExtractedPayment {
  provider: string;
  documentType: DocumentType;
  isPaymentReceipt: boolean;
  paymentNumber: string | null;
  paymentDate: Date | null;
  trackingNumber: string | null;
  reference: string | null;           // null if not found in PDF — never auto-generated
  internalImportId: string;           // internal ID only, never shown as payment reference
  customerName: string | null;
  amount: number | null;              // null = not detected, never default 0
  deliveryFee: number | null;
  returnFee: number | null;
  netAmount: number | null;
  paymentStatus: string;
  confidence: number;
  extractionSource: ExtractionSource;
  rawText: string;
  rawAiResponse?: string;
  blockReason?: string;               // why the import is blocked
}

// ─── parseMoney ───────────────────────────────────────────────────────────────

/**
 * Robust money parser. Returns null if no valid amount found.
 * Never returns 0 unless the input explicitly contains "0".
 */
export function parseMoney(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  let s = value.trim();
  if (!s) return null;

  // Remove currency suffixes
  s = s.replace(/\s*(TND|DT|EUR|USD|€|\$)\s*/gi, "").trim();

  // Remove invisible chars / non-breaking spaces
  s = s.replace(/[\u00A0\u200B\u202F\uFEFF]/g, "");

  // Remove thousands separators: "1 200.000" → "1200.000"
  s = s.replace(/\s+/g, "");

  // Handle comma decimal: "120,50" → "120.50", "120,000" → "120.000"
  if (s.includes(",") && s.includes(".")) {
    // Both: comma = thousands sep → remove it
    s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  // Keep only digits and one dot
  const match = s.match(/^(\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;

  return num;
}

// ─── Document type detection ──────────────────────────────────────────────────

const DELIVERY_SLIP_KEYWORDS = [
  "bordereau", "bon d'enlèvement", "bon enlevement", "manifeste",
  "liste des colis", "avis d'expédition", "avis expedition",
  "etiquette", "étiquette", "expéditeur", "expediteur",
];

const PAYMENT_RECEIPT_KEYWORDS = [
  "reçu de paiement", "recu de paiement", "bordereau de paiement",
  "relevé de paiement", "releve de paiement",
  "versement", "montant payé", "montant paye",
  "total payé", "total paye", "net payé", "net paye",
  "net à payer", "net a payer", "espèce", "espece",
  "chèque", "cheque", "virement", "paiement reçu",
  "avis de paiement", "bulletin de versement",
];

export function detectDocumentType(text: string): DocumentType {
  const lower = text.toLowerCase();

  const paymentScore = PAYMENT_RECEIPT_KEYWORDS.filter((k) => lower.includes(k)).length;
  const deliveryScore = DELIVERY_SLIP_KEYWORDS.filter((k) => lower.includes(k)).length;

  if (paymentScore > 0 && paymentScore >= deliveryScore) return "PAYMENT_RECEIPT";
  if (deliveryScore > 0) return "DELIVERY_SLIP";

  // Check for amount patterns as secondary signal
  const hasAmountWithKeyword = /(?:total|montant|net|payé|paye|espèce|espece)\s*[:\-]?\s*[\d.,]+/i.test(text);
  if (hasAmountWithKeyword) return "PAYMENT_RECEIPT";

  return "UNKNOWN";
}

// ─── Local extraction ─────────────────────────────────────────────────────────

const AMOUNT_PATTERNS = [
  // "Total payé : 120.000 TND"
  /(?:total\s*pay[eé]|montant\s*pay[eé]|net\s*[àa]\s*payer|net\s*pay[eé]|montant\s*r[eé]ception|esp[eè]ce|ch[eè]que|versement|paiement)\s*[:\-]?\s*([\d\s.,]+)\s*(?:TND|DT)?/gi,
  // "Total : 120.000 TND"
  /(?:total|montant|net)\s*[:\-]\s*([\d\s.,]+)\s*(?:TND|DT)/gi,
  // Standalone "120.000 TND" or "120,000 TND"
  /([\d]+[.,][\d]{3})\s*(?:TND|DT)/gi,
  // Simple "120 TND"
  /(\d+(?:[.,]\d+)?)\s*(?:TND|DT)/gi,
];

const TRACKING_PATTERNS = [
  /(?:code\s*[àa]?\s*barre?|tracking|num[eé]ro\s*colis|code\s*barre)\s*[:\-]?\s*([0-9]{10,})/gi,
  /\b([0-9]{13,})\b/g,
];

const PAYMENT_NUMBER_PATTERNS = [
  /(?:num[eé]ro?\s*(?:de\s*)?paiement|n[°o]\s*paiement|ref\s*paiement|bordereau\s*n[°o]?)\s*[:\-]?\s*([A-Z0-9\-]{4,})/gi,
  // InstaDelivery: "BV-20260417" or "REG-123" or "VERS-456"
  /\b(BV[\-_]?[0-9A-Z]{4,}|REG[\-_]?[0-9]{4,}|VERS[\-_]?[0-9]{4,}|PAY[\-_]?[0-9]{4,}|PV[\-_]?[0-9]{4,})/gi,
  // Payment number after date: "17/04/2026  BV123456"
  /(?:BV|REG|PAY|PV|VERS)\s*[:\-]?\s*([0-9A-Z\-]{4,})/gi,
  // Pure numeric payment reference ≥ 6 digits after keyword
  /(?:virement|versement|bordereau)\s*n[°o]?\s*[:\-]?\s*([0-9]{5,})/gi,
];

const REFERENCE_PATTERNS = [
  /(?:r[eé]f[eé]rence|ref)\s*[:\-]?\s*([A-Z0-9\-]{4,})/gi,
];

const CUSTOMER_PATTERNS = [
  /(?:client|destinataire|nom)\s*[:\-]\s*([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})/gi,
];

const DELIVERY_FEE_PATTERNS = [
  /(?:frais\s*(?:de\s*)?livraison|frais\s*port)\s*[:\-]?\s*([\d.,]+)\s*(?:TND|DT)?/gi,
];

const RETURN_FEE_PATTERNS = [
  /(?:frais\s*(?:de\s*)?retour|retour)\s*[:\-]?\s*([\d.,]+)\s*(?:TND|DT)?/gi,
];

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

function extractDate(text: string): Date | null {
  const m = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = new Date(`${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function extractBestAmount(text: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (m?.[1]) {
      const parsed = parseMoney(m[1]);
      if (parsed !== null && parsed > 0) return parsed;
    }
  }
  return null;
}

// ─── Validity check ───────────────────────────────────────────────────────────

function generateImportId(): string {
  return `IMP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

/**
 * A payment row is valid if it has amount > 0.
 * Identifier requirement is relaxed — internalImportId serves as fallback for dedup.
 */
function isValidPaymentRow(p: Partial<ExtractedPayment>): boolean {
  return !!(p.amount && p.amount > 0);
}

// ─── Main analysis function ───────────────────────────────────────────────────

export async function analyzePaymentPDF(
  text: string,
  provider: string,
  fileName: string = ""
): Promise<{ payments: ExtractedPayment[]; documentType: DocumentType; blocked: boolean; blockReason?: string }> {
  const internalImportId = generateImportId();

  console.log("[PDF] Analyzing file:", fileName, "| Provider:", provider, "| Text length:", text.length);
  console.log("[PDF] Raw text preview:", text.substring(0, 400).replace(/\s+/g, " "));

  // 1. Detect document type
  const documentType = detectDocumentType(text);
  console.log("[PDF] Document type detected:", documentType);

  // 2. Block non-payment docs
  if (documentType === "DELIVERY_SLIP") {
    return {
      payments: [],
      documentType,
      blocked: true,
      blockReason: "Ce document semble être un bordereau de livraison et non un reçu de paiement. Veuillez importer un reçu de paiement contenant les montants payés.",
    };
  }

  // 3. Local extraction
  const trackingNumber = firstMatch(text, TRACKING_PATTERNS);
  const paymentNumber = firstMatch(text, PAYMENT_NUMBER_PATTERNS);
  const reference = firstMatch(text, REFERENCE_PATTERNS);
  const customerName = firstMatch(text, CUSTOMER_PATTERNS);
  const amount = extractBestAmount(text);
  const deliveryFee = parseMoney(firstMatch(text, DELIVERY_FEE_PATTERNS));
  const returnFee = parseMoney(firstMatch(text, RETURN_FEE_PATTERNS));
  const paymentDate = extractDate(text);

  const localConfidence = (() => {
    let score = 0;
    if (documentType === "PAYMENT_RECEIPT") score += 0.3;
    if (amount !== null && amount > 0) score += 0.4;
    if (trackingNumber) score += 0.15;
    if (paymentNumber) score += 0.1;
    if (reference) score += 0.05;
    return Math.min(score, 1);
  })();

  console.log("[PDF] Local extraction:", { amount, trackingNumber, paymentNumber, reference, customerName, localConfidence });

  const localPayment: ExtractedPayment = {
    provider: provider || "UNKNOWN",
    documentType,
    isPaymentReceipt: documentType === "PAYMENT_RECEIPT",
    paymentNumber,
    paymentDate,
    trackingNumber,
    reference,
    internalImportId,
    customerName,
    amount,                // null if not found
    deliveryFee,
    returnFee,
    netAmount: amount !== null ? amount - (deliveryFee ?? 0) - (returnFee ?? 0) : null,
    paymentStatus: "RECEIVED",
    confidence: localConfidence,
    extractionSource: "LOCAL",
    rawText: text.substring(0, 1000),
  };

  // Trigger AI only if: amount completely missing, OR confidence very low
  // Do NOT trigger if amount is found (even without an identifier) — we allow that now
  const needsAI = amount === null || (localConfidence < 0.65 && amount === null);

  // 4. Google AI fallback
  if (needsAI) {
    console.log("[PDF] Confidence too low or amount missing, trying Google AI...");
    try {
      const aiResult = await analyzeWithGoogleAI(text, provider);
      if (aiResult) {
        console.log("[PDF] AI result:", { documentType: aiResult.documentType, totalAmount: aiResult.totalAmount, rows: aiResult.rows?.length });

        // If AI says it's not a payment receipt, block
        if (!aiResult.isPaymentReceipt || aiResult.documentType === "DELIVERY_SLIP") {
          return {
            payments: [],
            documentType: aiResult.documentType || documentType,
            blocked: true,
            blockReason: aiResult.message || "Ce document ne semble pas être un reçu de paiement.",
          };
        }

        const aiPayments: ExtractedPayment[] = (aiResult.rows || [])
          .map((row: any) => ({
            provider: aiResult.provider || provider || "UNKNOWN",
            documentType: aiResult.documentType || "PAYMENT_RECEIPT",
            isPaymentReceipt: true,
            paymentNumber: aiResult.paymentNumber || row.paymentNumber || null,
            paymentDate: aiResult.paymentDate ? new Date(aiResult.paymentDate) : null,
            trackingNumber: row.trackingNumber || null,
            reference: row.reference || null,
            internalImportId,
            customerName: row.customerName || null,
            amount: row.amount > 0 ? row.amount : null,
            deliveryFee: row.deliveryFee > 0 ? row.deliveryFee : null,
            returnFee: row.returnFee > 0 ? row.returnFee : null,
            netAmount: row.netAmount > 0 ? row.netAmount : null,
            paymentStatus: "RECEIVED",
            confidence: row.confidence || 0.6,
            extractionSource: "GOOGLE_AI" as ExtractionSource,
            rawText: text.substring(0, 1000),
            rawAiResponse: JSON.stringify(aiResult),
          }))
          .filter(isValidPaymentRow);

        // Fallback to totalAmount if no valid rows
        if (aiPayments.length === 0 && aiResult.totalAmount > 0) {
          aiPayments.push({
            ...localPayment,
            amount: aiResult.totalAmount,
            netAmount: aiResult.totalAmount,
            paymentNumber: aiResult.paymentNumber || null,
            extractionSource: "GOOGLE_AI",
            confidence: 0.65,
            rawAiResponse: JSON.stringify(aiResult),
          });
        }

        if (aiPayments.length > 0) {
          return { payments: aiPayments, documentType: aiResult.documentType || "PAYMENT_RECEIPT", blocked: false };
        }
      }
    } catch (err) {
      console.warn("[PDF] Google AI fallback failed:", err instanceof Error ? err.message : err);
    }
  }

  // 5. Validate local result
  if (!isValidPaymentRow(localPayment)) {
    if (documentType === "UNKNOWN") {
      return {
        payments: [],
        documentType,
        blocked: true,
        blockReason: "Aucun montant valide détecté. Ce document ne semble pas être un reçu de paiement.",
      };
    }
    // Return with null amount so UI can ask user to fill it in
    return {
      payments: [{ ...localPayment, blockReason: "Montant non détecté — veuillez le saisir manuellement." }],
      documentType,
      blocked: false,
    };
  }

  return { payments: [localPayment], documentType, blocked: false };
}

// ─── Google AI analysis ───────────────────────────────────────────────────────

async function analyzeWithGoogleAI(text: string, provider: string): Promise<any | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn("[PDF] GOOGLE_AI_API_KEY not set, skipping AI analysis");
    return null;
  }

  const model = process.env.GOOGLE_AI_MODEL || "gemini-1.5-flash";
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const client = new GoogleGenerativeAI(apiKey);

  const prompt = `Analyze this Tunisian delivery company PDF text.
Determine if it is a payment receipt or not.
Return ONLY valid JSON. Do not invent values.
If it is not a payment receipt, return isPaymentReceipt=false.
Never return amount=0 unless the document explicitly contains 0.
If a value is absent, return null.

PDF text:
"""
${text.substring(0, 4000)}
"""

Expected JSON (single object, not array):
{
  "isPaymentReceipt": true,
  "provider": "COLISSIMO | INSTADELIVERY | OTHER",
  "documentType": "PAYMENT_RECEIPT | DELIVERY_SLIP | MANIFEST | UNKNOWN",
  "paymentNumber": null,
  "paymentDate": null,
  "totalAmount": null,
  "rows": [
    {
      "trackingNumber": null,
      "reference": null,
      "customerName": null,
      "amount": null,
      "deliveryFee": null,
      "returnFee": null,
      "netAmount": null,
      "confidence": 0.8
    }
  ],
  "message": null
}`;

  const instance = client.getGenerativeModel({ model });
  const result = await instance.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, responseMimeType: "text/plain" },
  });

  const content = result?.response?.text?.();
  if (!content) return null;

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ─── Import payments to DB ────────────────────────────────────────────────────

export async function importPaymentsFromPDF(
  teamId: string,
  payments: ExtractedPayment[],
  source: string = "PDF_IMPORT"
): Promise<{ imported: number; errors: string[] }> {
  let imported = 0;
  const errors: string[] = [];

  for (const payment of payments) {
    // Block imports with no valid amount
    if (!payment.amount || payment.amount <= 0) {
      errors.push(`Montant invalide ou nul pour ${payment.trackingNumber || payment.reference || payment.internalImportId}`);
      continue;
    }

    // Block imports with no identifying info
    if (!payment.trackingNumber && !payment.reference && !payment.paymentNumber) {
      errors.push("Aucun tracking, référence ou numéro de paiement valide");
      continue;
    }

    try {
      // Anti-doublon check
      const orClauses: any[] = [];
      if (payment.trackingNumber) orClauses.push({ trackingNumber: payment.trackingNumber });
      if (payment.paymentNumber) orClauses.push({ paymentNumber: payment.paymentNumber });
      // Only use reference for dedup if it looks like a real reference (not our internal ID)
      if (payment.reference && !payment.reference.startsWith("IMP-") && !payment.reference.startsWith("PDF-")) {
        orClauses.push({ reference: payment.reference });
      }

      const existing = orClauses.length > 0
        ? await prisma.deliveryRevenue.findFirst({
            where: { teamId, provider: payment.provider, OR: orClauses },
          })
        : null;

      const financeSettings = await getFinanceSettings(teamId, payment.provider);
      const withholdingTaxApplied = calculateWithholdingTax(
        payment.amount,
        financeSettings.withholdingTaxPercent
      );

      const data = {
        source,
        trackingNumber: payment.trackingNumber,
        reference: payment.reference,
        customerName: payment.customerName,
        amount: payment.amount,
        deliveryFee: payment.deliveryFee ?? 0,
        returnFee: payment.returnFee ?? 0,
        withholdingTaxApplied,
        netAmount:
          payment.netAmount ??
          payment.amount - (payment.deliveryFee ?? 0) - (payment.returnFee ?? 0) - withholdingTaxApplied,
        paymentNumber: payment.paymentNumber,
        paymentDate: payment.paymentDate,
        paymentStatus: "RECEIVED",
        isValidated: false,
        confidenceScore: payment.confidence,
        rawData: {
          rawText: payment.rawText,
          extractionSource: payment.extractionSource,
          rawAiResponse: payment.rawAiResponse || null,
          internalImportId: payment.internalImportId,
        } as any,
        pdfFileName: null,
      };

      if (existing) {
        await prisma.deliveryRevenue.update({ where: { id: existing.id }, data });
      } else {
        await prisma.deliveryRevenue.create({
          data: { ...data, provider: payment.provider, team: { connect: { id: teamId } }, importedAt: new Date() },
        });
      }

      imported++;
    } catch (err) {
      errors.push(`Erreur: ${err instanceof Error ? err.message : "Inconnu"}`);
    }
  }

  return { imported, errors };
}

// ─── Validate / Reject ────────────────────────────────────────────────────────

export async function validatePayment(
  teamId: string,
  targetId: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Search by ID (deliveryRevenue) or orderId
    const existing = await prisma.deliveryRevenue.findFirst({ 
      where: { 
        teamId,
        OR: [
          { id: targetId },
          { orderId: targetId }
        ]
      },
      include: { order: true }
    });
    
    if (!existing) {
      // If no deliveryRevenue exists but we have an orderId, we might want to create one 
      // or just update the order. For now, let's update the order directly.
      const order = await prisma.order.findFirst({ where: { id: targetId, teamId } });
      if (order) {
        const financeSettings = await getFinanceSettings(teamId, order.shippingProvider);
        const withholdingTaxApplied =
          order.withholdingTaxApplied ||
          calculateWithholdingTax(order.revenue || 0, financeSettings.withholdingTaxPercent);
        await prisma.order.update({
          where: { id: targetId },
          data: {
            validatedRevenue: order.revenue,
            withholdingTaxApplied,
            financeStatus: "VALIDATED",
            netProfit:
              (order.revenue || 0) -
              (order.deliveryCostApplied || 0) -
              (order.returnCostApplied || 0) -
              withholdingTaxApplied -
              (order.cost || 0)
          }
        });
        return { success: true, message: "Commande validée directement (sans reçu)" };
      }
      return { success: false, message: "Paiement ou commande non trouvé" };
    }
    
    await prisma.$transaction(async (tx) => {
      // Update Revenue
      await tx.deliveryRevenue.update({
        where: { id: existing.id },
        data: { paymentStatus: "VALIDATED", isValidated: true, validatedAt: new Date() },
      });

      // Update Order if linked
      if (existing.orderId) {
        const order = existing.order;
        if (order) {
          const validatedRevenue = existing.amount || order.revenue || 0;
          const deliveryFee = existing.deliveryFee || order.deliveryCostApplied || 0;
          const returnFee = existing.returnFee || order.returnCostApplied || 0;
          const financeSettings = await getFinanceSettings(teamId, existing.provider);
          const withholdingTaxApplied =
            existing.withholdingTaxApplied ||
            order.withholdingTaxApplied ||
            calculateWithholdingTax(validatedRevenue, financeSettings.withholdingTaxPercent);
          const netProfit =
            validatedRevenue -
            deliveryFee -
            returnFee -
            withholdingTaxApplied -
            (order.cost || 0);

          await tx.deliveryRevenue.update({
            where: { id: existing.id },
            data: { withholdingTaxApplied },
          });

          await tx.order.update({
            where: { id: existing.orderId },
            data: {
              validatedRevenue,
              deliveryCostApplied: deliveryFee,
              returnCostApplied: returnFee,
              withholdingTaxApplied,
              netProfit,
              financeStatus: "VALIDATED",
              paymentNumber: existing.paymentNumber || order.paymentNumber
            }
          });
        }
      }
    });

    return { success: true, message: "Paiement validé et commande mise à jour" };
  } catch (err) {
    console.error("[validatePayment] Error:", err);
    return { success: false, message: err instanceof Error ? err.message : "Erreur" };
  }
}

export async function rejectPayment(
  teamId: string,
  targetId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const existing = await prisma.deliveryRevenue.findFirst({ 
      where: { 
        teamId,
        OR: [
          { id: targetId },
          { orderId: targetId }
        ]
      } 
    });

    if (!existing) {
      const order = await prisma.order.findFirst({ where: { id: targetId, teamId } });
      if (order) {
        await prisma.order.update({
          where: { id: targetId },
          data: { validatedRevenue: 0, withholdingTaxApplied: 0, financeStatus: "REJECTED" }
        });
        return { success: true, message: "Commande rejetée" };
      }
      return { success: false, message: "Paiement non trouvé" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.deliveryRevenue.update({
        where: { id: existing.id },
        data: { paymentStatus: "REJECTED", isValidated: false },
      });

      if (existing.orderId) {
        await tx.order.update({
          where: { id: existing.orderId },
          data: {
            validatedRevenue: 0,
            withholdingTaxApplied: 0,
            financeStatus: "REJECTED"
          }
        });
      }
    });

    return { success: true, message: "Paiement rejeté" };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Erreur" };
  }
}
