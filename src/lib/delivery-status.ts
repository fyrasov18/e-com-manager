/**
 * delivery-status.ts — Source de vérité pour les statuts de livraison
 * 
 * Règle métier :
 * Tout statut "Retour*" = RETURNED + DELIVERY_ANOMALY + returnFee = 3 TND
 */

export const RETURN_FEE_TND = 3;

// ── Statuts qui sont des "retours" (anomalie) ────────────────────────
export const RETURN_STATUSES = new Set([
  "RETURN_RECEIVED",
  "RETURNED_FINAL",
  "RETURNED_TO_SENDER",
  "RETURNED_TO_AGENCY",
  "RETURN_DEPOT",
  "RETURN_DELIVERED",
  "RETURNED",
  "RETURN_CLOSED",
  // Nouveaux statuts français
  "RETOUR",
  "RETOUR_RECU",
  "RETOUR_REÇU",
  "RETOUR_RECUPERE",
  "RETOUR_RÉCUPÉRÉ",
  "RETOUR_LIVRE",
  "ANOMALIE",
  "ECHEC",
  "FAILED",
]);

// ── Statuts livrés avec succès ───────────────────────────────────────
export const DELIVERED_STATUSES = new Set([
  "DELIVERED",
  "DELIVERED_CLOSED",
  "PAID_DELIVERED",
  "EXCHANGE_DELIVERED",
  "DELIVERED_BY_SENDER",
  // Statuts français
  "LIVRE",
  "LIVREE",
  "LIVRÉ",
  "LIVRÉE",
  "DELIVERED_TO_CUSTOMER",
]);

// ── Statuts en cours ─────────────────────────────────────────────────
export const IN_PROGRESS_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "IN_DEPOT",
  "IN_DELIVERY",
  "RETURN_DEPOT",
]);

// ── Mapping Colissimo (label API → statut plateforme) ────────────────
export const COLISSIMO_STATUS_MAP: Record<string, string> = {
  "En Attente":              "PENDING",
  "A Enlever":               "READY_FOR_PICKUP",
  "Enlevé":                  "PICKED_UP",
  "Anomalie d'Enlèvement":   "PICKUP_ISSUE",
  "Anomalie d`Enlévement":   "PICKUP_ISSUE",
  "Anomalie d'Enlévement":   "PICKUP_ISSUE",
  "Anomalie d'Enlevement":   "PICKUP_ISSUE",
  "Au Dépôt":                "IN_DEPOT",
  "En Cours de Livraison":   "IN_DELIVERY",
  "Retour Dépôt":            "RETURN_DEPOT",
  "Retour Dépot":            "RETURN_DEPOT",
  "Anomalie de Livraison":   "DELIVERY_ISSUE",
  "Livré":                   "DELIVERED",
  "Livré Payé":              "PAID_DELIVERED",
  // ── Statuts retour → RETURNED (anomalie livraison)
  "Retour Client Agence":    "RETURNED",
  "Retour Définitif":        "RETURNED",
  "Retour Expéditeur":       "RETURNED",
  "Retour Reçu":             "RETURNED",
  "Rtn Client - Agence":     "RETURNED",
  "Retour Livré":            "RETURNED",
  // Échanges
  "Echange Reçu":            "EXCHANGE_RECEIVED",
  "Echange Créé":            "EXCHANGE_CREATED",
};

// ── Mapping InstaDelivery (etat code → statut plateforme) ────────────
export const INSTADELIVERY_STATUS_MAP: Record<string, string> = {
  "1":  "PENDING",
  "3":  "PICKED_UP",
  "4":  "IN_DEPOT",
  "5":  "IN_DELIVERY",
  "6":  "DELIVERY_ISSUE",
  "7":  "DELIVERED",
  "19": "PICKUP_ISSUE",
  "21": "DELIVERED",       // Échange livré
  "23": "DELIVERED_CLOSED", // Livraison clôturée et payée
  "16": "DELIVERED",       // Échange clôturé
  // ── Statuts retour → RETURNED (anomalie livraison)
  "22": "RETURNED",        // Clôture retour
  "28": "RETURNED",        // Retour Livré ← règle métier principale
};

// ── Labels affichage ─────────────────────────────────────────────────
export const STATUS_LABELS: Record<string, string> = {
  PENDING:            "En attente",
  READY_FOR_PICKUP:   "Prêt à enlever",
  PICKED_UP:          "Enlevé",
  IN_DEPOT:           "Au dépôt",
  IN_DELIVERY:        "En livraison",
  DELIVERED:          "Livré",
  DELIVERED_CLOSED:   "Livré et payé",
  PAID_DELIVERED:     "Livré payé",
  EXCHANGE_DELIVERED: "Échange livré",
  DELIVERED_BY_SENDER:"Livré par expéditeur",
  CONFIRMED:          "Confirmé",
  DELIVERY_ISSUE:     "Anomalie livraison",
  PICKUP_ISSUE:       "Anomalie enlèvement",
  RETURN_DEPOT:       "Retour dépôt",
  RETURNED:           "Anomalie / Retour",
  RETURN_RECEIVED:    "Anomalie / Retour",
  RETURNED_FINAL:     "Anomalie / Retour",
  RETURNED_TO_SENDER: "Anomalie / Retour",
  RETURNED_TO_AGENCY: "Anomalie / Retour",
  RETURN_DELIVERED:   "Anomalie / Retour",
  RETURN_CLOSED:      "Retour clôturé",
  EXCHANGE_RECEIVED:  "Échange reçu",
  EXCHANGE_CREATED:   "Échange créé",
  UNKNOWN:            "Inconnu",
  // Statuts français livrés
  LIVRE:              "Livré",
  LIVREE:             "Livrée",
  // Statuts français retours
  RETOUR:             "Retour",
  RETOUR_RECU:        "Retour reçu",
  RETOUR_RECUPERE:    "Retour récupéré",
  RETOUR_LIVRE:       "Retour livré",
  ANOMALIE:           "Anomalie",
  ECHEC:              "Échec",
  FAILED:              "Échec",
};

export const ORDER_STATUS_CLASS_NAMES: Record<string, string> = {
  PAID_DELIVERED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  DELIVERED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  DELIVERED_BY_SENDER: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  DELIVERED_CLOSED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  EXCHANGE_DELIVERED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  CONFIRMED: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  IN_DELIVERY: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  SHIPPED: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  IN_DEPOT: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  READY_FOR_PICKUP: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  PICKED_UP: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  RETURNED: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  RETURN_RECEIVED: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  RETURNED_FINAL: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  RETURNED_TO_SENDER: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  RETURNED_TO_AGENCY: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  RETURN_DELIVERED: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  RETURN_CLOSED: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  RETURN_DEPOT: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  DELIVERY_ISSUE: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  PICKUP_ISSUE: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  EXCHANGE_RECEIVED: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  EXCHANGE_CREATED: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  PENDING: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  UNKNOWN: "text-muted-foreground bg-muted/30 border-border",
  CANCELLED: "text-muted-foreground bg-muted/30 border-border",
};

export const ORDER_STATUS_OPTIONS = [
  "PENDING",
  "CONFIRMED",
  "PICKED_UP",
  "IN_DEPOT",
  "IN_DELIVERY",
  "DELIVERED",
  "DELIVERED_CLOSED",
  "PAID_DELIVERED",
  "RETURN_RECEIVED",
  "RETURNED",
  "DELIVERY_ISSUE",
  "CANCELLED",
];

export const MANUAL_ORDER_STATUS_OPTIONS = [
  "PENDING",
  "CONFIRMED",
  "DELIVERED_BY_SENDER",
  "CANCELLED",
  "RETURNED",
];

// ── Helpers ──────────────────────────────────────────────────────────

export function normalizeOrderStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isReturnStatus(status: string | null | undefined): boolean {
  return RETURN_STATUSES.has(normalizeOrderStatus(status));
}

export function isDeliveredStatus(status: string | null | undefined): boolean {
  return DELIVERED_STATUSES.has(normalizeOrderStatus(status));
}

export function getOrderStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeOrderStatus(status);
  return STATUS_LABELS[normalized] ?? (normalized || "UNKNOWN");
}

export function getStatusLabel(status: string | null | undefined): string {
  return getOrderStatusLabel(status);
}

export function getOrderStatusClassName(status: string | null | undefined): string {
  return ORDER_STATUS_CLASS_NAMES[normalizeOrderStatus(status)] ?? ORDER_STATUS_CLASS_NAMES.UNKNOWN;
}

/** Mappe un label Colissimo brut → statut plateforme */
export function mapColissimoStatusStr(raw: string): string {
  if (!raw) return "UNKNOWN";
  if (COLISSIMO_STATUS_MAP[raw]) return COLISSIMO_STATUS_MAP[raw];
  const normalized = raw.trim();
  for (const [key, val] of Object.entries(COLISSIMO_STATUS_MAP)) {
    if (key.toLowerCase() === normalized.toLowerCase()) return val;
  }
  return "UNKNOWN";
}

/** Mappe un code etat InstaDelivery → statut plateforme */
export function mapInstaDeliveryStatusCode(etat: string | number): string {
  return INSTADELIVERY_STATUS_MAP[String(etat)] ?? "PENDING";
}

/** Mappe un label etat_str InstaDelivery → statut plateforme (fallback) */
export function mapInstaDeliveryStatusStr(etatStr: string): string {
  const s = etatStr.toLowerCase();
  if (s.includes("retour livré") || s.includes("retour reçu") || s.includes("retour définitif") || s.includes("retour expéditeur") || s.includes("retour client")) return "RETURNED";
  if (s.includes("livré") && s.includes("payé")) return "PAID_DELIVERED";
  if (s.includes("livré")) return "DELIVERED";
  if (s.includes("anomalie")) return "DELIVERY_ISSUE";
  if (s.includes("cours")) return "IN_DELIVERY";
  if (s.includes("dépôt") || s.includes("depot")) return "IN_DEPOT";
  if (s.includes("enlevé")) return "PICKED_UP";
  if (s.includes("retour")) return "RETURNED";
  return "PENDING";
}

/** Retourne le returnFee applicable (3 TND si retour, sinon 0) */
export function getReturnFee(status: string): number {
  return isReturnStatus(status) ? RETURN_FEE_TND : 0;
}
