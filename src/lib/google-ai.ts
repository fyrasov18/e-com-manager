import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_AI_API_KEY;
const model = process.env.GOOGLE_AI_MODEL || "gemini-1.5-mini";

function createGoogleAIClient() {
  if (!apiKey) {
    throw new Error("Missing GOOGLE_AI_API_KEY");
  }

  return new GoogleGenerativeAI(apiKey);
}

function sanitizeJsonString(value: string) {
  const cleaned = value
    .replace(/\r\n/g, "\n")
    .replace(/\n\s*\n/g, "\n")
    .replace(/,\s*]/g, "]")
    .replace(/,\s*}/g, "}");

  const startIdx = cleaned.indexOf("[");
  const startIdxObj = cleaned.indexOf("{");
  const first = startIdx === -1 ? Infinity : startIdx;
  const firstObj = startIdxObj === -1 ? Infinity : startIdxObj;
  const begin = Math.min(first, firstObj);
  
  if (begin === Infinity) {
    throw new Error("Impossible d'extraire JSON de la reponse de l'IA");
  }

  let depth = 0;
  let end = begin;
  for (let i = begin; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  return cleaned.substring(begin, end);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const text = String(value).trim();
  const date = new Date(text);
  if (!isNaN(date.getTime())) {
    return date;
  }

  const match = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (match) {
    const normalized = `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    const parsed = new Date(normalized);
    return !isNaN(parsed.getTime()) ? parsed : null;
  }

  return null;
}

function parseFloatValue(value: unknown) {
  if (value === null || value === undefined) return 0;
  const text = String(value).replace(/\s/g, "").replace(/,/g, ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface GoogleAIExtractedPayment {
  provider?: string;
  paymentNumber?: string | null;
  paymentDate?: string | null;
  trackingNumber?: string | null;
  reference?: string | null;
  customerName?: string | null;
  amount?: number;
  deliveryFee?: number;
  returnFee?: number;
  netAmount?: number;
  paymentStatus?: string | null;
  confidence?: number;
  rawText?: string;
}

export async function analyzePaymentReceiptWithGoogleAI(
  rawText: string,
  provider: string
) {
  const client = createGoogleAIClient();
  const prompt = `Extract payment metadata from the following receipt text. Use the provider value as a hint.

Receipt text:
"""
${rawText}
"""

Return only valid JSON as an array of objects with these fields:
- provider
- paymentNumber
- paymentDate (ISO 8601 date string or null)
- trackingNumber
- reference
- customerName
- amount
- deliveryFee
- returnFee
- netAmount
- paymentStatus
- confidence

If a value is missing, use null for strings/dates and 0 for numeric fields. Output JSON only.
`;

  const modelInstance = client.getGenerativeModel({ model });
  const result = await modelInstance.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      candidateCount: 1,
      responseMimeType: "text/plain",
    },
  });

  const content = result?.response?.text?.();
  if (!content) {
    throw new Error("Google AI n'a pas renvoyé de réponse valide");
  }

  const jsonText = sanitizeJsonString(content);
  const parsed = JSON.parse(jsonText) as GoogleAIExtractedPayment | GoogleAIExtractedPayment[];
  const results = Array.isArray(parsed) ? parsed : [parsed];

  return results.map((item) => ({
    provider: item.provider || provider || "UNKNOWN",
    paymentNumber: item.paymentNumber || null,
    paymentDate: parseDate(item.paymentDate || null),
    trackingNumber: item.trackingNumber || null,
    reference: item.reference || null,
    customerName: item.customerName || null,
    amount: parseFloatValue(item.amount),
    deliveryFee: parseFloatValue(item.deliveryFee),
    returnFee: parseFloatValue(item.returnFee),
    netAmount: parseFloatValue(item.netAmount),
    paymentStatus: item.paymentStatus || "PENDING",
    confidence: Math.min(1, Math.max(0, parseFloatValue(item.confidence) || 0.6)),
  }));
}
