import { type NextRequest } from "next/server";
import { handleCronSyncDelivery } from "../_sync-delivery";

/**
 * GET /api/cron/sync-delivery
 * Protected by Authorization: Bearer CRON_SECRET.
 * Call this every minute via external cron (cron-job.org, Vercel cron, etc.)
 *
 * Example vercel.json:
 * { "crons": [{ "path": "/api/cron/sync-delivery", "schedule": "* * * * *" }] }
 */
export async function GET(request: NextRequest) {
  return handleCronSyncDelivery(request);
}
