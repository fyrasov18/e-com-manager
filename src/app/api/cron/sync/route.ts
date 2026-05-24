import { type NextRequest } from "next/server";
import { handleCronSyncDelivery } from "../_sync-delivery";

/**
 * GET /api/cron/sync
 * Protected by Authorization: Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  return handleCronSyncDelivery(request);
}

export async function POST(request: NextRequest) {
  return handleCronSyncDelivery(request);
}
