import { type NextRequest, NextResponse } from "next/server";

export async function handleCronSyncDelivery(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { getOrCreateDefaultTeamId } = await import("@/lib/default-team");
    const { syncDeliveryCompanies, getSyncStatus } = await import("@/lib/sync-delivery");

    const teamId = await getOrCreateDefaultTeamId();
    const status = getSyncStatus();

    if (status.isSyncing) {
      return NextResponse.json({ skipped: true, reason: "already_running" });
    }

    syncDeliveryCompanies(teamId).catch((e) =>
      console.error("[Cron/sync-delivery] Error:", e)
    );

    return NextResponse.json({ triggered: true, teamId, at: new Date().toISOString() });
  } catch (err) {
    console.error("[Cron/sync-delivery]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
