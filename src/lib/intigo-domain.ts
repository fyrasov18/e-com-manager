// Intigo statuts + validation + persistance locale.
import { prisma } from "@/lib/prisma";

export const INTIGO_STATUS_MAP: Record<string, string> = {
  "1000": "PICKED_UP", "1001": "PICKED_UP", "1002": "PICKED_UP", "1003": "PICKED_UP",
  "1004": "PICKED_UP", "1005": "PICKED_UP", "1006": "PICKED_UP", "1007": "PICKED_UP",
  "1008": "PICKED_UP", "1101": "CANCELLED", "1102": "CANCELLED",
  "2000": "IN_DEPOT", "2001": "IN_DEPOT", "2004": "IN_DEPOT", "2100": "IN_DEPOT",
  "3100": "IN_DELIVERY", "4000": "IN_DELIVERY",
  "3201": "RETURNED", "6000": "RETURNED", "6001": "RETURNED", "6500": "RETURNED", "6900": "RETURNED",
  "5000": "DELIVERED",
  "9000": "CANCELLED", "9001": "CANCELLED", "9002": "CANCELLED", "9003": "CANCELLED", "9004": "CANCELLED",
  "99": "IN_DELIVERY",
};

export const INTIGO_STATUS_LABELS: Record<string, string> = {
  "1000": "Pickup vendeur", "2000": "En entrepôt", "2001": "Relance", "2004": "Reçu",
  "2100": "Vérification", "3100": "Transfert livraison", "3201": "Transfert retour",
  "4000": "En livraison", "5000": "Livré", "6000": "Retour préparation",
  "6001": "Retour prêt", "6500": "Retour échange", "6900": "Retour reçu",
  "99": "Réacheminement",
};

export function mapIntigoStatusCode(code: unknown): string {
  if (code === null || code === undefined) return "PENDING";
  return INTIGO_STATUS_MAP[String(code).trim()] ?? "PENDING";
}

export function intigoStatusLabel(code: unknown): string {
  if (code === null || code === undefined) return "En attente";
  return INTIGO_STATUS_LABELS[String(code).trim()] ?? `Statut ${String(code)}`;
}

export function buildIntigoCid(orderId: string, teamId: string): string {
  return `ECOM-${teamId.slice(0, 8)}-${orderId.slice(0, 8)}`.slice(0, 50);
}

export function validateIntigoCreateByIds(input: any): { valid: boolean; errors: string[]; value?: any } {
  const errors: string[] = [];
  const recipient_name = String(input?.recipient_name ?? "").trim();
  const phone1 = String(input?.phone1 ?? "").replace(/[\s.\-()]/g, "");
  const destination_address = String(input?.destination_address ?? "").trim();
  const city = Number(input?.destination_city_id);
  const district = Number(input?.destination_district_id);
  const pickup = Number(input?.pickup_index);
  const price = input?.price === undefined || input?.price === null || String(input.price) === "" ? 0 : Number(input.price);
  if (!recipient_name) errors.push("recipient_name requis");
  if (!phone1 || phone1.replace(/\D/g, "").length < 8) errors.push("phone1 invalide (8 chiffres min)");
  if (!destination_address) errors.push("destination_address requise (ne jamais inventer)");
  if (!Number.isInteger(city)) errors.push("destination_city_id requis");
  if (!Number.isInteger(district)) errors.push("destination_district_id requis");
  if (!Number.isInteger(pickup)) errors.push("pickup_index requis");
  if (!Number.isFinite(price) || price < 0) errors.push("price invalide");
  if (input?.cid && String(input.cid).length > 50) errors.push("cid max 50");
  if (errors.length) return { valid: false, errors };
  return {
    valid: true, errors: [],
    value: {
      recipient_name, phone1, destination_address,
      destination_city_id: city, destination_district_id: district,
      ...(input?.destination_neighborhood_id !== undefined && String(input.destination_neighborhood_id) !== "" ? { destination_neighborhood_id: Number(input.destination_neighborhood_id) } : {}),
      ...(input?.phone2 ? { phone2: String(input.phone2) } : {}),
      ...(input?.client_email ? { client_email: String(input.client_email) } : {}),
      price, package_size: input?.package_size !== undefined ? Number(input.package_size) : 1,
      ...(input?.description ? { description: String(input.description) } : {}),
      ...(input?.additional_info ? { additional_info: String(input.additional_info) } : {}),
      ...(input?.can_open !== undefined ? { can_open: Boolean(input.can_open) } : {}),
      ...(input?.is_exchange !== undefined ? { is_exchange: Boolean(input.is_exchange) } : {}),
      pickup_index: pickup,
      ...(input?.cid ? { cid: String(input.cid).slice(0, 50) } : {}),
    },
  };
}

export async function findIntigoParcelByOrder(teamId: string, orderId: string) {
  try { return await (prisma as any).intigoParcel.findUnique({ where: { teamId_orderId: { teamId, orderId } } }); }
  catch { return await (prisma as any).intigoParcel.findFirst({ where: { teamId, orderId } }).catch(() => null); }
}

export async function logIntigoHistory(teamId: string, e: { orderId?: string | null; nid?: string | null; action: string; success: boolean; message?: string | null }) {
  try {
    await (prisma as any).intigoSyncHistory.create({ data: { teamId, orderId: e.orderId ?? null, nid: e.nid ?? null, action: e.action, success: e.success, message: e.message ?? null } });
  } catch (err) { console.error("[Intigo] history failed"); }
}
