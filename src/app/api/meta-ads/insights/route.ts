import { NextResponse } from "next/server";
import { fetchMetaCampaignInsights, MetaAdsApiError } from "@/lib/meta-ads";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      accessToken?: string;
      adAccountId?: string;
      since?: string;
      until?: string;
    };

    const accessToken = body.accessToken?.trim();
    const adAccountId = body.adAccountId?.trim();
    const since = body.since?.trim();
    const until = body.until?.trim();

    if (!accessToken || !adAccountId || !since || !until) {
      return NextResponse.json(
        { error: "accessToken, adAccountId, since, until are required." },
        { status: 400 }
      );
    }

    const campaigns = await fetchMetaCampaignInsights({
      accessToken,
      adAccountId,
      since,
      until,
    });

    const totals = campaigns.reduce(
      (acc, campaign) => {
        acc.spend += Number(campaign.spend ?? "0");
        acc.clicks += Number(campaign.clicks ?? "0");
        acc.impressions += Number(campaign.impressions ?? "0");
        return acc;
      },
      { spend: 0, clicks: 0, impressions: 0 }
    );

    return NextResponse.json({
      totals,
      campaigns,
    });
  } catch (error) {
    if (error instanceof MetaAdsApiError && error.isPermissionError) {
      return NextResponse.json(
        {
          error:
            "Le propriétaire du compte publicitaire n'a pas accordé ads_read ou ads_management à cette application/token.",
          details: [
            "Vérifiez que le token contient au minimum ads_read pour lire les statistiques.",
            "Vérifiez que l'utilisateur ou le System User est assigné au compte publicitaire dans Meta Business Manager.",
            "Vérifiez que l'app Meta a l'accès requis pour ads_read ou ads_management dans Permissions and Features.",
            "Regénérez le token après avoir modifié les permissions ou les assets.",
          ],
          fbtraceId: error.fbtraceId,
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch Meta Ads insights.",
      },
      { status: 500 }
    );
  }
}
