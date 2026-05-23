"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertTriangle, BarChart3, DollarSign, ShoppingCart, Package, PieChart } from "lucide-react";

type Campaign = {
  campaign_id: string;
  campaign_name: string;
  impressions: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc?: string;
  cpm?: string;
};

type Recommendation = {
  priority: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  rationale: string;
  action: string;
};

type InsightsResponse = {
  totals: { spend: number; clicks: number; impressions: number };
  campaigns: Campaign[];
};

type ApiErrorPayload = {
  error?: string;
  details?: string[];
  fbtraceId?: string;
};

const USD_TO_TND_RATE = 3.3;
const META_CREDENTIALS_STORAGE_KEY = "jody-meta-ads-credentials";

function toNumber(value: string | number | null | undefined) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function toTnd(usdAmount: string | number | null | undefined) {
  return toNumber(usdAmount) * USD_TO_TND_RATE;
}

function formatTnd(value: number) {
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} DT`;
}

function formatUsd(value: string | number | null | undefined) {
  return `${toNumber(value).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;
}

export default function AnalyticsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;

  const [form, setForm] = useState({
    accessToken: "",
    adAccountId: "",
    since: monthStart,
    until: today,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [fbtraceId, setFbtraceId] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [agentName, setAgentName] = useState("");
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [businessData, setBusinessData] = useState<{
    totalOrders: number;
    totalRevenue: number;
    totalProducts: number;
    lowStock: number;
  } | null>(null);

  useEffect(() => {
    try {
      const savedCredentials = window.localStorage.getItem(META_CREDENTIALS_STORAGE_KEY);
      if (savedCredentials) {
        const parsed = JSON.parse(savedCredentials) as {
          accessToken?: string;
          adAccountId?: string;
        };
        setForm((prev) => ({
          ...prev,
          accessToken: parsed.accessToken ?? "",
          adAccountId: parsed.adAccountId ?? "",
        }));
      }
    } catch (e) {
      console.error("[Analytics] Meta credentials restore error:", e);
    }

    async function loadBusinessStats() {
      try {
        const res = await fetch("/api/dashboard");
        const data = await res.json();
        if (data.kpis) {
          setBusinessData({
            totalOrders: data.kpis.totalOrders?.value || 0,
            totalRevenue: data.kpis.revenue?.value || 0,
            totalProducts: data.kpis.products?.value || 0,
            lowStock: data.kpis.products?.lowStock || 0,
          });
        }
      } catch (e) {
        console.error("[Analytics] Business stats error:", e);
      }
    }
    loadBusinessStats();
  }, []);

  const derived = useMemo(() => {
    if (!insights) return { cpc: 0, cpm: 0, spendTnd: 0 };
    const spendTnd = toTnd(insights.totals.spend);
    const cpc = insights.totals.clicks > 0 ? spendTnd / insights.totals.clicks : 0;
    const cpm = insights.totals.impressions > 0 ? (spendTnd / insights.totals.impressions) * 1000 : 0;
    return { cpc, cpm, spendTnd };
  }, [insights]);

  function saveMetaCredentials() {
    try {
      window.localStorage.setItem(
        META_CREDENTIALS_STORAGE_KEY,
        JSON.stringify({
          accessToken: form.accessToken.trim(),
          adAccountId: form.adAccountId.trim(),
        })
      );
      setSavedMessage("Identifiants Meta sauvegardés sur cet appareil.");
      window.setTimeout(() => setSavedMessage(""), 3000);
    } catch (e) {
      console.error("[Analytics] Meta credentials save error:", e);
      setError("Impossible de sauvegarder les identifiants Meta sur cet appareil.");
    }
  }

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMetaCredentials();
    setLoading(true);
    setError("");
    setErrorDetails([]);
    setFbtraceId("");
    setInsights(null);
    setRecommendations([]);

    const insightsRes = await fetch("/api/meta-ads/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const insightsPayload = await insightsRes.json().catch(() => ({}));
    if (!insightsRes.ok) {
      const payload = insightsPayload as ApiErrorPayload;
      setError(payload.error ?? "Unable to fetch Meta Ads data.");
      setErrorDetails(payload.details ?? []);
      setFbtraceId(payload.fbtraceId ?? "");
      setLoading(false);
      return;
    }

    setInsights(insightsPayload as InsightsResponse);

    const recoRes = await fetch("/api/meta-ads/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaigns: insightsPayload.campaigns }),
    });

    const recoPayload = await recoRes.json().catch(() => ({}));
    if (recoRes.ok && recoPayload.recommendations) {
      setRecommendations(recoPayload.recommendations);
      if (recoPayload.engine) setAgentName(recoPayload.engine);
    }

    setLoading(false);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Tableaux de bord
          </h1>
          <p className="text-muted-foreground mt-1 text-sm lg:text-base">
            Visualisez les statistiques de votre business.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            <p className="text-xs text-muted-foreground">Chiffre affaires</p>
          </div>
          <p className="text-xl font-bold text-emerald-500">
            {businessData?.totalRevenue?.toLocaleString("fr-FR") || 0} DT
          </p>
        </div>
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="h-4 w-4 text-violet-500" />
            <p className="text-xs text-muted-foreground">Commandes</p>
          </div>
          <p className="text-xl font-bold text-violet-500">
            {businessData?.totalOrders || 0}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-amber-500" />
            <p className="text-xs text-muted-foreground">Produits</p>
          </div>
          <p className="text-xl font-bold text-amber-500">
            {businessData?.totalProducts || 0}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-card border border-rose-500/30">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <p className="text-xs text-muted-foreground">Stock faible</p>
          </div>
          <p className="text-xl font-bold text-rose-500">
            {businessData?.lowStock || 0}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive space-y-2">
          <p className="font-medium">{error}</p>
          {errorDetails.length > 0 && (
            <ul className="list-disc pl-5 text-destructive/90 space-y-1">
              {errorDetails.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
          {fbtraceId && <p className="text-xs text-destructive/70">Meta fbtrace_id: {fbtraceId}</p>}
        </div>
      )}

      {savedMessage && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">
          {savedMessage}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 lg:p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Meta Ads Analytics
        </h2>
        
        <form onSubmit={handleAnalyze} className="grid gap-4 sm:grid-cols-2 mb-6">
          <input
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="Meta access token"
            value={form.accessToken}
            onChange={(e) => setForm((prev) => ({ ...prev, accessToken: e.target.value }))}
          />
          <input
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="Ad Account ID"
            value={form.adAccountId}
            onChange={(e) => setForm((prev) => ({ ...prev, adAccountId: e.target.value }))}
          />
          <input
            type="date"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={form.since}
            onChange={(e) => setForm((prev) => ({ ...prev, since: e.target.value }))}
          />
          <input
            type="date"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={form.until}
            onChange={(e) => setForm((prev) => ({ ...prev, until: e.target.value }))}
          />
          <button
            type="button"
            onClick={saveMetaCredentials}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 font-medium hover:bg-muted/40"
          >
            Sauvegarder les identifiants
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PieChart className="h-4 w-4" />}
            {loading ? "Analyse en cours..." : "Analyser"}
          </button>
        </form>

        {insights && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Dépense Meta</p>
                <p className="text-xl font-bold">{formatTnd(derived.spendTnd)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatUsd(insights.totals.spend)} x {USD_TO_TND_RATE}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Clicks</p>
                <p className="text-xl font-bold">{insights.totals.clicks}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Impressions</p>
                <p className="text-xl font-bold">{insights.totals.impressions}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">CPC moyen</p>
                <p className="text-xl font-bold">{derived.cpc.toFixed(2)} DT</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">CPM moyen</p>
                <p className="text-xl font-bold">{derived.cpm.toFixed(2)} DT</p>
              </div>
            </div>

            {insights.campaigns.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold">Campagnes</h3>
                {insights.campaigns.map((campaign) => (
                  <div key={campaign.campaign_id} className="rounded-lg border border-border p-4">
                <p className="font-medium">{campaign.campaign_name}</p>
                <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                      <span>Spend: {formatTnd(toTnd(campaign.spend))}</span>
                      <span>USD: {formatUsd(campaign.spend)}</span>
                      <span>CTR: {Number(campaign.ctr).toFixed(2)}%</span>
                      <span>Clicks: {campaign.clicks}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {recommendations.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold">
                  Recommandations{agentName ? ` - ${agentName}` : ""}
                </h3>
                {recommendations.map((item) => (
                  <div key={`${item.priority}-${item.title}`} className="rounded-lg border border-border p-4">
                    <p className="text-xs font-bold uppercase text-muted-foreground">{item.priority}</p>
                    <p className="mt-1 font-medium">{item.title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{item.rationale}</p>
                    <p className="mt-2 text-sm">{item.action}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
