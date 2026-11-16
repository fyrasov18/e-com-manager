"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Package,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Truck,
  CreditCard,
  Plus,
  FilePlus,
  Repeat,
  Wallet,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

type ChartPoint = { name: string; revenue: number; profit: number };

type KpiData = {
  value: number;
  change: number;
};

type ExpensesData = {
  value: number;
  monthly: number;
  oneTime: number;
};

type OrdersData = {
  value: number;
  delivered: number;
  returned: number;
  pending: number;
  shipped: number;
};

type PaymentsData = {
  pending: number;
  validated: number;
  paidAmount?: number;
  remainingAmount?: number;
  collectionRate?: number;
};

type DashboardData = {
  kpis: {
    revenue: KpiData;
    validatedRevenue: KpiData;
    profit: KpiData;
    orders: KpiData;
    totalOrders: OrdersData;
    products: KpiData & { lowStock: number };
    expenses: ExpensesData;
    generalExpenses?: KpiData;
    metaAds?: KpiData;
    logistics?: {
      deliveryFees: number;
      returnFees: number;
      withholdingTax: number;
      total: number;
    };
    payments: PaymentsData;
    netProfit: KpiData & { marginRate?: number };
    cogs?: { value: number };
    stockValue?: {
      value: number;
      totalQuantity: number;
      lowStock: number;
      productsCount: number;
    };
  };
  finance?: any;
  chartData: ChartPoint[];
};

function fmt(value: number, isCount = false) {
  if (isCount) return value.toLocaleString("fr-FR");
  return `${value.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} DT`;
}

function fmtChange(change: number) {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function KpiSkeleton() {
  return (
    <div className="p-6 rounded-xl bg-card border border-border animate-pulse">
      <div className="h-4 w-20 bg-muted rounded mb-4" />
      <div className="h-8 w-28 bg-muted rounded mb-3" />
      <div className="h-3 w-16 bg-muted rounded" />
    </div>
  );
}

function TrendIcon({ positive, neutral }: { positive: boolean; neutral?: boolean }) {
  if (neutral) return <span className="h-4 w-4 flex items-center justify-center">—</span>;
  return positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [finance, setFinance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [resD, resF] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/finance")
      ]);
      
      if (!resD.ok || !resF.ok) throw new Error("fetch_failed");
      
      const jsonD = await resD.json();
      const jsonF = await resF.json();
      
      if (jsonD.error) throw new Error(jsonD.error);
      if (!jsonF.success) throw new Error(jsonF.message || "Erreur finance");
      
      console.log("Finance dashboard data:", jsonF);
      
      setData(jsonD as DashboardData);
      setFinance(jsonF.data);
    } catch (err) {
      console.error(err);
      setError("Erreur chargement Vue d’ensemble");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Vue d&apos;ensemble
          </h1>
          <p className="text-muted-foreground mt-1 text-sm lg:text-base">
            Bonjour Jody. Voici l&apos;état de votre business.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualiser
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Link
          href="/orders"
          className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 text-sm text-foreground transition hover:border-primary/50 hover:bg-primary/5"
        >
          <Plus className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="font-semibold">Ajouter une commande</p>
            <p className="text-xs text-muted-foreground">Créez une commande rapidement</p>
          </div>
        </Link>
        <Link
          href="/products"
          className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 text-sm text-foreground transition hover:border-primary/50 hover:bg-primary/5"
        >
          <Package className="h-5 w-5 text-sky-400" />
          <div>
            <p className="font-semibold">Ajouter un produit</p>
            <p className="text-xs text-muted-foreground">Gérez votre catalogue</p>
          </div>
        </Link>
        <Link
          href="/payments"
          className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 text-sm text-foreground transition hover:border-primary/50 hover:bg-primary/5"
        >
          <Wallet className="h-5 w-5 text-orange-400" />
          <div>
            <p className="font-semibold">Importer paiements</p>
            <p className="text-xs text-muted-foreground">Validez les paiements reçus</p>
          </div>
        </Link>
        <Link
          href="/shipping-providers/insta-delivery"
          className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 text-sm text-foreground transition hover:border-primary/50 hover:bg-primary/5"
        >
          <Repeat className="h-5 w-5 text-violet-400" />
          <div>
            <p className="font-semibold">Synchroniser API</p>
            <p className="text-xs text-muted-foreground">Mettez à jour les commandes et paiements</p>
          </div>
        </Link>
        <Link
          href="/expenses"
          className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 text-sm text-foreground transition hover:border-primary/50 hover:bg-primary/5"
        >
          <FilePlus className="h-5 w-5 text-rose-400" />
          <div>
            <p className="font-semibold">Ajouter une dépense</p>
            <p className="text-xs text-muted-foreground">Suivez vos coûts</p>
          </div>
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── 7 Financial Indicators in Strict Required Order ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
        {loading ? (
          Array.from({ length: 7 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : (
          <>
            {/* 1. CHIFFRE D'AFFAIRES */}
            <div className="card-hover kpi-glow p-5 lg:p-6 rounded-2xl bg-card border border-border/60 col-span-1 md:col-span-2 xl:col-span-2 relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground/70">
                      1. CHIFFRE D&apos;AFFAIRES
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      COD inclus
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                    <DollarSign className="h-5 w-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-3">
                  <h2 className="text-3xl lg:text-4xl font-extrabold font-mono tracking-tight tabular-nums text-foreground">
                    {fmt(finance?.chiffreAffaires || 0)}
                  </h2>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-semibold px-2.5 py-0.5 rounded-full text-xs",
                      (data?.kpis?.revenue?.change ?? 0) >= 0
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-rose-500/10 text-rose-500"
                    )}
                  >
                    <TrendIcon positive={(data?.kpis?.revenue?.change ?? 0) >= 0} />
                    {fmtChange(data?.kpis?.revenue?.change ?? 0)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Ventes réalisées sur les commandes livrées (aucun double comptage des encaissements)
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Commandes livrées</span>
                  <span className="font-semibold font-mono text-sm text-foreground">
                    {fmt(finance?.deliveredOrdersCount || 0, true)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Panier moyen</span>
                  <span className="font-semibold font-mono text-sm text-foreground">
                    {fmt(finance?.deliveredOrdersCount > 0 ? (finance.chiffreAffaires / finance.deliveredOrdersCount) : 0)}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-muted-foreground block text-[11px]">Total commandes</span>
                  <span className="font-semibold font-mono text-sm text-foreground">
                    {fmt(finance?.totalOrdersCount || 0, true)}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. FRAIS LOGISTIQUES & RETENUE À LA SOURCE */}
            <div className="card-hover p-5 lg:p-6 rounded-2xl bg-card border border-border/60 col-span-1 md:col-span-2 xl:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground/70">
                      2. FRAIS LOGISTIQUES &amp; RETENUE À LA SOURCE
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500">
                    <Truck className="h-5 w-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-3xl font-extrabold font-mono tracking-tight tabular-nums text-foreground">
                    {fmt(finance?.totalLogisticsAndTax || 0)}
                  </h2>
                  <span className="text-xs text-muted-foreground font-medium">total déductions</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Déductions transporteurs séparées (strictement exclues des dépenses générales)
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40">
                  <span className="text-muted-foreground text-[10px] block font-medium">Livraison</span>
                  <span className="font-bold font-mono text-foreground text-sm">
                    {fmt(finance?.totalDeliveryFees || 0)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40">
                  <span className="text-muted-foreground text-[10px] block font-medium">
                    Retour ({finance?.returnedOrdersCount || 0})
                  </span>
                  <span className="font-bold font-mono text-foreground text-sm">
                    {fmt(finance?.totalReturnFees || 0)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40">
                  <span className="text-muted-foreground text-[10px] block font-medium">Retenue (RS)</span>
                  <span className="font-bold font-mono text-foreground text-sm">
                    {fmt(finance?.totalWithholdingTax || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. PAIEMENTS REÇUS DES SOCIÉTÉS DE LIVRAISON */}
            <div className="card-hover p-5 lg:p-6 rounded-2xl bg-card border border-border/60 col-span-1 md:col-span-2 xl:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground/70">
                      3. PAIEMENTS REÇUS DES SOCIÉTÉS DE LIVRAISON
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                    <Wallet className="h-5 w-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-3">
                  <h2 className="text-3xl font-extrabold font-mono tracking-tight tabular-nums text-foreground">
                    {fmt(finance?.paidAmount || 0)}
                  </h2>
                  <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full text-xs bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                    Fonds validés
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Règlements bancaires nets confirmés (distincts du montant brut encaissé auprès des clients)
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-border/50 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Créances en attente</span>
                  <span className="font-bold font-mono text-amber-500">
                    {fmt(finance?.remainingAmount || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Taux de recouvrement</span>
                  <span className="font-bold font-mono text-foreground">
                    {(finance?.collectionRate || 0).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, finance?.collectionRate || 0))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 4. DÉPENSES GÉNÉRALES */}
            <div className="card-hover p-5 lg:p-6 rounded-2xl bg-card border border-border/60 col-span-1 xl:col-span-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-muted-foreground/70">
                    4. DÉPENSES GÉNÉRALES
                  </span>
                  <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
                    <TrendingDown className="h-5 w-5" />
                  </div>
                </div>
                <h2 className="text-2xl lg:text-3xl font-extrabold font-mono tracking-tight tabular-nums text-foreground">
                  {fmt(finance?.generalExpenses || 0)}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Outils, emballages, services, fournitures (exclut logistique, RS et Meta Ads)
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-border/50 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">Charges OPEX</span>
                <span className="font-semibold font-mono text-foreground">
                  {fmt(finance?.operationalCharges || 0)}
                </span>
              </div>
            </div>

            {/* 5. DÉPENSES META ADS */}
            <div className="card-hover p-5 lg:p-6 rounded-2xl bg-card border border-border/60 col-span-1 xl:col-span-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-muted-foreground/70">
                    5. DÉPENSES META ADS
                  </span>
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                    <CreditCard className="h-5 w-5" />
                  </div>
                </div>
                <h2 className="text-2xl lg:text-3xl font-extrabold font-mono tracking-tight tabular-nums text-foreground">
                  {fmt(finance?.metaAdsExpenses || 0)}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Publicité Facebook &amp; Instagram synchronisée
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-border/50 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">Taux conversion</span>
                <span className="font-semibold font-mono text-muted-foreground text-[11px]">
                  1 USD ≈ 3.100 DT
                </span>
              </div>
            </div>

            {/* 6. BÉNÉFICE NET */}
            <div className="card-hover p-5 lg:p-6 rounded-2xl bg-gradient-to-br from-card via-card to-blue-500/5 border-2 border-primary/30 col-span-1 md:col-span-2 xl:col-span-2 shadow-lg shadow-primary/5 flex flex-col justify-between relative">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-primary">
                      6. BÉNÉFICE NET
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      Résultat Comptable
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-3">
                  <h2 className={cn(
                    "text-3xl lg:text-4xl font-extrabold font-mono tracking-tight tabular-nums",
                    (finance?.netProfit || 0) >= 0 ? "text-emerald-500" : "text-rose-500"
                  )}>
                    {fmt(finance?.netProfit || 0)}
                  </h2>
                  <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md bg-muted text-foreground">
                    Marge : {finance?.chiffreAffaires > 0 ? ((finance.netProfit / finance.chiffreAffaires) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  CA livrés − COGS produits − Frais transport &amp; RS − Meta Ads − Charges générales
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-background/60 border border-border/40">
                  <span className="text-muted-foreground text-[10px] block">COGS (Vendus)</span>
                  <span className="font-semibold font-mono text-foreground">
                    {fmt(finance?.totalProductCosts || 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-background/60 border border-border/40">
                  <span className="text-muted-foreground text-[10px] block">Transport &amp; RS</span>
                  <span className="font-semibold font-mono text-foreground">
                    {fmt(finance?.totalLogisticsAndTax || 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-background/60 border border-border/40">
                  <span className="text-muted-foreground text-[10px] block">Meta Ads</span>
                  <span className="font-semibold font-mono text-foreground">
                    {fmt(finance?.metaAdsExpenses || 0)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-background/60 border border-border/40">
                  <span className="text-muted-foreground text-[10px] block">Dépenses gén.</span>
                  <span className="font-semibold font-mono text-foreground">
                    {fmt(finance?.generalExpenses || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* 7. VALEUR DU STOCK */}
            <div className="card-hover p-5 lg:p-6 rounded-2xl bg-card border border-border/60 col-span-1 md:col-span-2 xl:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-500">
                      7. VALEUR DU STOCK
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      Actif Circulant
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
                    <Package className="h-5 w-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-3">
                  <h2 className="text-3xl font-extrabold font-mono tracking-tight tabular-nums text-foreground">
                    {fmt(finance?.stockValue || 0)}
                  </h2>
                  <span className="text-xs text-muted-foreground font-medium">valorisation au prix d&apos;achat</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  SUM(Prix d&apos;achat × Quantité disponible) — Actif d&apos;inventaire non déduit du bénéfice
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Unités disponibles</span>
                  <span className="font-semibold font-mono text-sm text-foreground">
                    {fmt(finance?.totalStockQuantity || 0, true)} pcs
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Références catalogue</span>
                  <span className="font-semibold font-mono text-sm text-foreground">
                    {fmt(finance?.totalProductsCount || 0, true)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Alerte stock faible</span>
                  <span className={cn(
                    "font-semibold font-mono text-sm",
                    (finance?.lowStockCount || 0) > 0 ? "text-amber-500" : "text-emerald-500"
                  )}>
                    {finance?.lowStockCount || 0} produit(s)
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 lg:p-6 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base lg:text-lg font-semibold">
              Évolution du Revenu
            </h3>
            <span className="text-xs text-muted-foreground hidden sm:block">
              7 derniers mois
            </span>
          </div>
          <div className="h-[280px] lg:h-[320px] w-full">
            {loading ? (
              <div className="h-full w-full rounded-lg bg-muted animate-pulse" />
            ) : data && data.chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="var(--muted-foreground)"
                    axisLine={false}
                    tickLine={false}
                    fontSize={12}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    axisLine={false}
                    tickLine={false}
                    fontSize={12}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: "8px",
                    }}
                    itemStyle={{ color: "var(--foreground)" }}
                    formatter={(value) => {
                      const n = typeof value === "number" ? value : Number(value ?? 0);
                      return [`${n.toLocaleString("fr-FR")} DT`];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenu"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Bénéfice"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorProfit)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                <Package className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">
                  Aucune commande enregistrée.
                </p>
                <p className="text-muted-foreground/70 text-xs">
                  Ajoutez des commandes pour voir les graphiques.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 lg:p-6 rounded-xl bg-card border border-border flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-primary text-lg">📊</span>
            </div>
            <h3 className="text-base lg:text-lg font-semibold">Résumé</h3>
          </div>

          {loading ? (
            <div className="space-y-3 flex-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (data && finance) ? (
            <div className="space-y-3 flex-1">
              <SummaryRow
                emoji="💰"
                label="Revenu ce mois"
                value={fmt(Number(finance.chiffreAffaires || 0))}
                sub={`${fmtChange(data?.kpis?.revenue?.change ?? 0)} vs mois dernier`}
                positive={(data?.kpis?.revenue?.change ?? 0) >= 0}
              />
              <SummaryRow
                emoji="📦"
                label="Commandes ce mois"
                value={fmt(data?.kpis?.orders?.value ?? 0, true)}
                sub={`${fmtChange(data?.kpis?.orders?.change ?? 0)} vs mois dernier`}
                positive={(data?.kpis?.orders?.change ?? 0) >= 0}
              />
              <SummaryRow
                emoji="🏷️"
                label="Produits en catalogue"
                value={fmt(data?.kpis?.products?.value ?? 0, true)}
                sub="Total actuel en base"
                positive={true}
              />
            </div>
          ) : null}

          <a
            href="/transactions"
            className="w-full mt-6 py-2.5 rounded-lg bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors text-center text-sm block"
          >
            Voir toutes les transactions →
          </a>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  emoji,
  label,
  value,
  sub,
  positive,
}: {
  emoji: string;
  label: string;
  value: string;
  sub: string;
  positive: boolean;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 border border-border">
      <p className="text-sm font-medium text-foreground mb-0.5">
        {emoji} {label}
      </p>
      <p className="text-lg font-bold font-mono">{value}</p>
      <p
        className={cn(
          "text-xs mt-1",
          positive
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400"
        )}
      >
        {sub}
      </p>
    </div>
  );
}