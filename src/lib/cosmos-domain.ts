// src/lib/cosmos-domain.ts — Types, villes tunisiennes, statuts et mappers pour Cosmos Delivery.

export const COSMOS_CITIES = [
  "Ariana",
  "Ben Arous",
  "Manouba",
  "Tunis",
  "Sfax",
  "Kairouan",
  "Gafsa",
  "Gabes",
  "Bizerte",
  "Beja",
  "Jendouba",
  "Kasserine",
  "Kebili",
  "Kef",
  "Mahdia",
  "Medenine",
  "Monastir",
  "Nabeul",
  "Sidi Bouzid",
  "Siliana",
  "Sousse",
  "Tataouine",
  "Tozeur",
  "Zaghouan",
] as const;

export type CosmosCity = typeof COSMOS_CITIES[number];

export const COSMOS_STATUS_MAP: Record<string, string> = {
  "pending": "PENDING",
  "to-be-picked": "READY_FOR_PICKUP",
  "in-depot": "IN_DEPOT",
  "in-delivery": "IN_DELIVERY",
  "to-be-verified": "DELIVERY_ISSUE",
  "return-stock": "RETURN_DEPOT",
  "delivered": "DELIVERED",
  "final-return": "RETURNED",
  "received-return": "RETURNED",
  "in-transfer": "IN_DEPOT",
  "return-in-transfer": "RETURN_DEPOT",
};

export const COSMOS_STATUS_LABELS: Record<string, string> = {
  "pending": "En attente",
  "to-be-picked": "À ramasser",
  "in-depot": "Au dépôt",
  "in-delivery": "En livraison",
  "to-be-verified": "À vérifier",
  "return-stock": "Retour dépôt",
  "delivered": "Livré",
  "final-return": "Retour final",
  "received-return": "Retour Reçu",
  "in-transfer": "Inter-dépôt",
  "return-in-transfer": "Inter-retour",
};

export function mapCosmosStatus(status: string | null | undefined): string {
  if (!status) return "PENDING";
  const s = String(status).trim().toLowerCase();
  return COSMOS_STATUS_MAP[s] || s.toUpperCase();
}

export function cosmosStatusLabel(status: string | null | undefined): string {
  if (!status) return "Inconnu";
  const s = String(status).trim().toLowerCase();
  return COSMOS_STATUS_LABELS[s] || status;
}

export interface CosmosCreateOrderInput {
  name: string;
  phone: string;
  address: string;
  city: CosmosCity | string;
  totalAmount: number;
  quantity: number;
  content: string;
  phone2?: string;
  packageCount?: number;
  note?: string;
  options?: {
    allowToOpen?: boolean;
    isFragile?: boolean;
  };
  source?: string | null;
  externalBarcode?: string;
  exchange?: boolean;
}

export interface CosmosOrderData {
  id: string; // 12-digit padded
  barcode: string;
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  createdAt?: string;
  status: string;
  paymentStatus: "paid" | "unpaid" | "pending" | string;
  totalAmount?: number;
  quantity?: number;
  content?: string;
  externalBarcode?: string | null;
  integrationBarcode?: string | null;
  printed?: boolean;
  updatedAt?: string;
  statusType?: string;
  labelUrl?: string;
  labelPdfUrl?: string;
}
