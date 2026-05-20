// src/lib/parse-invoice-pdf.ts
// Utilise Claude AI pour extraire les lignes d'une facture PDF fournisseur

export interface ParsedInvoiceLine {
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ParsedInvoice {
  invoiceRef?: string;
  invoiceDate?: string;
  supplierName?: string;
  totalAmount?: number;
  lines: ParsedInvoiceLine[];
}

export async function parseInvoicePDF(
  base64PDF: string
): Promise<ParsedInvoice> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64PDF,
              },
            },
            {
              type: "text",
              text: `Extrais les informations de cette facture fournisseur et retourne UNIQUEMENT un JSON valide sans aucun texte avant ou après.

Format attendu :
{
  "invoiceRef": "numéro de facture ou null",
  "invoiceDate": "date au format YYYY-MM-DD ou null",
  "supplierName": "nom du fournisseur ou null",
  "totalAmount": nombre ou null,
  "lines": [
    {
      "productName": "nom exact du produit",
      "quantity": nombre entier,
      "unitPrice": nombre décimal,
      "totalPrice": nombre décimal
    }
  ]
}

Si une valeur est absente, utilise null. Les prix sont en TND.`,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "{}";

  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ParsedInvoice;
  } catch {
    return { lines: [] };
  }
}
