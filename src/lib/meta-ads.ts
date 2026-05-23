type MetaInsightsParams = {
  accessToken: string;
  adAccountId: string;
  since: string;
  until: string;
};

export type MetaCampaignInsight = {
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc?: string;
  cpm?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

type MetaApiErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export class MetaAdsApiError extends Error {
  code?: number;
  subcode?: number;
  fbtraceId?: string;
  isPermissionError: boolean;

  constructor(payload: MetaApiErrorPayload) {
    const message =
      payload.error?.message ??
      "Meta Ads API error while fetching campaign insights.";
    super(message);
    this.name = "MetaAdsApiError";
    this.code = payload.error?.code;
    this.subcode = payload.error?.error_subcode;
    this.fbtraceId = payload.error?.fbtrace_id;
    this.isPermissionError =
      this.code === 200 &&
      /ads_management|ads_read|permission/i.test(message);
  }
}

export async function fetchMetaCampaignInsights(params: MetaInsightsParams) {
  const accountId = params.adAccountId.startsWith("act_")
    ? params.adAccountId
    : `act_${params.adAccountId}`;

  const fields = [
    "campaign_id",
    "campaign_name",
    "impressions",
    "clicks",
    "spend",
    "ctr",
    "cpc",
    "cpm",
    "actions",
  ].join(",");

  const timeRange = encodeURIComponent(
    JSON.stringify({ since: params.since, until: params.until })
  );

  const url = `https://graph.facebook.com/v23.0/${accountId}/insights?level=campaign&fields=${fields}&time_range=${timeRange}&limit=100`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
    cache: "no-store",
  });

  const payload = (await res.json()) as MetaApiErrorPayload & {
    data?: MetaCampaignInsight[];
  };
  if (!res.ok) {
    throw new MetaAdsApiError(payload);
  }

  return (payload?.data ?? []) as MetaCampaignInsight[];
}
