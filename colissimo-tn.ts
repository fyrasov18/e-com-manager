// src/lib/colissimo-tn.ts
// Intégration Colissimo Tunisie — à ajuster selon leur documentation API exacte

const BASE_URL = process.env.COLISSIMO_TN_BASE_URL ?? "https://delivery.colissimo.com.tn/api";
const CLIENT_ID = process.env.COLISSIMO_TN_CLIENT_ID!;
const API_KEY = process.env.COLISSIMO_TN_API_KEY!;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColissimoShipmentPayload {
  orderRef: string;         // Référence commande Jody Shop
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  senderCity: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverCity: string;
  receiverPostalCode: string;
  weight: number;           // en kg
  declaredValue: number;    // en TND
  isCOD: boolean;           // Cash on delivery
  codAmount?: number;       // Montant à collecter si COD
  notes?: string;
}

export interface ColissimoShipmentResponse {
  success: boolean;
  trackingNumber: string;
  labelUrl?: string;
  estimatedDelivery?: string;
  error?: string;
}

export interface ColissimoTrackingResponse {
  trackingNumber: string;
  status: string;
  statusLabel: string;
  location?: string;
  timestamp?: string;
  history: {
    status: string;
    label: string;
    location: string;
    date: string;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Client-Id": CLIENT_ID,
    "X-Api-Key": API_KEY,
  };
}

// Mapping statuts Colissimo TN → statuts Jody Shop
export function mapColissimoStatus(status: string): string {
  const map: Record<string, string> = {
    CREATED: "Expédition créée",
    PICKED_UP: "Colis collecté",
    IN_TRANSIT: "En transit",
    OUT_FOR_DELIVERY: "En cours de livraison",
    DELIVERED: "Livré",
    FAILED_ATTEMPT: "Tentative échouée",
    RETURNED: "Retourné",
    CANCELLED: "Annulé",
  };
  return map[status] ?? status;
}

// ─── Créer une expédition ─────────────────────────────────────────────────────

export async function createShipment(
  payload: ColissimoShipmentPayload
): Promise<ColissimoShipmentResponse> {
  try {
    const res = await fetch(`${BASE_URL}/shipments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        client_id: CLIENT_ID,
        reference: payload.orderRef,
        expediteur: {
          nom: payload.senderName,
          telephone: payload.senderPhone,
          adresse: payload.senderAddress,
          ville: payload.senderCity,
        },
        destinataire: {
          nom: payload.receiverName,
          telephone: payload.receiverPhone,
          adresse: payload.receiverAddress,
          ville: payload.receiverCity,
          code_postal: payload.receiverPostalCode,
        },
        colis: {
          poids: payload.weight,
          valeur_declaree: payload.declaredValue,
          contre_remboursement: payload.isCOD,
          montant_remboursement: payload.codAmount ?? 0,
          remarques: payload.notes ?? "",
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        trackingNumber: "",
        error: data.message ?? "Erreur lors de la création de l'expédition",
      };
    }

    return {
      success: true,
      trackingNumber: data.tracking_number ?? data.numero_suivi,
      labelUrl: data.label_url ?? data.etiquette_url,
      estimatedDelivery: data.estimated_delivery ?? data.date_livraison_estimee,
    };
  } catch (err) {
    return {
      success: false,
      trackingNumber: "",
      error: err instanceof Error ? err.message : "Erreur réseau",
    };
  }
}

// ─── Suivre un colis ──────────────────────────────────────────────────────────

export async function trackShipment(
  trackingNumber: string
): Promise<ColissimoTrackingResponse | null> {
  try {
    const res = await fetch(`${BASE_URL}/tracking/${trackingNumber}`, {
      headers: headers(),
      next: { revalidate: 300 }, // cache 5 min (Next.js)
    });

    if (!res.ok) return null;

    const data = await res.json();

    return {
      trackingNumber,
      status: data.status ?? data.statut,
      statusLabel: mapColissimoStatus(data.status ?? data.statut),
      location: data.location ?? data.localisation,
      timestamp: data.updated_at ?? data.date_mise_a_jour,
      history: (data.history ?? data.historique ?? []).map((h: {
        status?: string; statut?: string;
        label?: string; libelle?: string;
        location?: string; localisation?: string;
        date?: string;
      }) => ({
        status: h.status ?? h.statut,
        label: mapColissimoStatus(h.status ?? h.statut ?? ""),
        location: h.location ?? h.localisation ?? "",
        date: h.date ?? "",
      })),
    };
  } catch {
    return null;
  }
}

// ─── Annuler une expédition ───────────────────────────────────────────────────

export async function cancelShipment(trackingNumber: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/shipments/${trackingNumber}/cancel`, {
      method: "POST",
      headers: headers(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
