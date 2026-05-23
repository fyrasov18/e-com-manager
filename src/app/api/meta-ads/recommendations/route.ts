import { NextResponse } from "next/server";
import { runAdsRecommendationAgent } from "@/lib/ads-ai-agent";
import { MetaCampaignInsight } from "@/lib/meta-ads";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { campaigns?: MetaCampaignInsight[] };
    const campaigns = Array.isArray(body.campaigns) ? body.campaigns : [];

    const result = await runAdsRecommendationAgent({ campaigns });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate recommendations." },
      { status: 500 }
    );
  }
}
