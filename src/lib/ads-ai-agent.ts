import { MetaCampaignInsight } from "@/lib/meta-ads";

type AgentInput = {
  campaigns: MetaCampaignInsight[];
};

type AgentRecommendation = {
  priority: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  rationale: string;
  action: string;
};

const CONVERSION_ACTION_TYPES = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
]);

function toNumber(value: string | undefined) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function getConversions(campaign: MetaCampaignInsight) {
  if (!campaign.actions || campaign.actions.length === 0) return 0;
  return campaign.actions.reduce((sum, action) => {
    if (!CONVERSION_ACTION_TYPES.has(action.action_type)) return sum;
    return sum + toNumber(action.value);
  }, 0);
}

function heuristicRecommendations(campaigns: MetaCampaignInsight[]): AgentRecommendation[] {
  if (campaigns.length === 0) {
    return [
      {
        priority: "MEDIUM",
        title: "No campaign data",
        rationale: "No campaigns were returned for the selected date range.",
        action: "Check account id, access token permissions, and date range.",
      },
    ];
  }

  const recommendations: AgentRecommendation[] = [];
  const lowCtr = campaigns.filter((c) => toNumber(c.ctr) < 1 && toNumber(c.impressions) > 1000);
  const highSpendNoConv = campaigns.filter(
    (c) => toNumber(c.spend) > 50 && getConversions(c) === 0
  );
  const highCpc = campaigns.filter((c) => toNumber(c.cpc) > 1.2 && toNumber(c.clicks) > 20);

  if (highSpendNoConv.length > 0) {
    const sample = highSpendNoConv.slice(0, 3).map((c) => c.campaign_name).join(", ");
    recommendations.push({
      priority: "HIGH",
      title: "Budget leak without conversions",
      rationale: `Some campaigns spend significantly without purchases: ${sample}.`,
      action:
        "Pause these ad sets temporarily, validate pixel events, and relaunch with narrower audiences.",
    });
  }

  if (lowCtr.length > 0) {
    recommendations.push({
      priority: "MEDIUM",
      title: "Low CTR creative fatigue",
      rationale:
        "Campaigns with high impressions and CTR below 1% indicate weak hooks or audience mismatch.",
      action:
        "Create 3 new creatives (UGC hook, offer angle, social proof) and run A/B tests per audience.",
    });
  }

  if (highCpc.length > 0) {
    recommendations.push({
      priority: "MEDIUM",
      title: "CPC too expensive",
      rationale:
        "Cost per click is high on multiple campaigns, reducing traffic volume for the same budget.",
      action:
        "Split placements, reduce audience overlap, and test broad + lookalike 1-3% with optimized creatives.",
    });
  }

  recommendations.push({
    priority: "LOW",
    title: "Scale winning campaigns gradually",
    rationale:
      "Aggressive scaling often breaks performance due to learning reset and audience saturation.",
    action:
      "Increase budget by 15-20% every 48h on profitable campaigns and monitor CPA/ROAS drift.",
  });

  return recommendations;
}

async function llmRecommendations(campaigns: MetaCampaignInsight[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const compact = campaigns.slice(0, 30).map((c) => ({
    campaign_name: c.campaign_name,
    impressions: c.impressions,
    clicks: c.clicks,
    spend: c.spend,
    ctr: c.ctr,
    cpc: c.cpc,
    conversions: getConversions(c),
  }));

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an elite performance marketing analyst. Return strict JSON with key recommendations as an array of {priority,title,rationale,action}.",
        },
        {
          role: "user",
          content: `Analyze these Meta Ads campaign metrics and propose prioritized actions:\n${JSON.stringify(
            compact
          )}`,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    const list = parsed?.recommendations;
    if (!Array.isArray(list)) return null;
    return list as AgentRecommendation[];
  } catch {
    return null;
  }
}

export async function runAdsRecommendationAgent(input: AgentInput) {
  const heuristic = heuristicRecommendations(input.campaigns);
  const llm = await llmRecommendations(input.campaigns);

  return {
    agent: llm ? "AI+Heuristic" : "Heuristic",
    recommendations: llm && llm.length > 0 ? llm : heuristic,
  };
}
