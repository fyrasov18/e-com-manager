import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import {
  getAutoOrderImportConfig,
  getAutoOrderImportStatus,
  getLatestAutoOrderImportLog,
  runAutomaticOrderImport,
} from "@/lib/automatic-order-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getProvidedSecret(req: NextRequest): string | null {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : null;

  return (
    req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret") ??
    bearer
  );
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return getProvidedSecret(req) === expected;
}

async function shouldSkipForInterval(teamId: string, force: boolean) {
  if (force) return null;

  const config = getAutoOrderImportConfig();
  const latestLog = await getLatestAutoOrderImportLog(teamId);
  if (!latestLog?.startedAt) return null;

  const elapsedMs = Date.now() - latestLog.startedAt.getTime();
  const intervalMs = config.intervalMinutes * 60 * 1000;

  if (elapsedMs < intervalMs) {
    return {
      skipped: true,
      reason: "interval_not_reached",
      nextRunAt: new Date(latestLog.startedAt.getTime() + intervalMs).toISOString(),
    };
  }

  return null;
}

async function handleImport(req: NextRequest, force: boolean) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const config = getAutoOrderImportConfig();
  const status = getAutoOrderImportStatus();
  const teamId = await getOrCreateDefaultTeamId();

  if (!config.enabled) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "disabled",
      config: {
        provider: config.provider,
        intervalMinutes: config.intervalMinutes,
      },
      status,
    });
  }

  const intervalSkip = await shouldSkipForInterval(teamId, force);
  if (intervalSkip) {
    return NextResponse.json({ success: true, ...intervalSkip, status });
  }

  const result = await runAutomaticOrderImport(teamId);
  return NextResponse.json({ success: result.success, teamId, result, status: getAutoOrderImportStatus() });
}

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "true";
  return handleImport(req, force);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const force = body.force === true || req.nextUrl.searchParams.get("force") === "true";
  return handleImport(req, force);
}
