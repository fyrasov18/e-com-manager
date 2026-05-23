"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Package,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Truck,
  CreditCard,
  Plus,
  PlusCircle,
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
    payments: PaymentsData;
    netProfit: KpiData;
  };
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

const kpiDefs = (data && finance)
    ? [
        {
          title: "Chiffre d'affaires",
          value: fmt(Number(finance.chiffreAffaires || 0)),
          change: fmtChange(data?.kpis?.revenue?.change ?? 0),
          isPositive: true,
          icon: DollarSign,
          color: "text-emerald-500",
          bgColor: "from-emerald-500/20",
        },
        {
          title: "Bénéfice Net",
          value: fmt(Number(finance.netProfit || 0)),
          change: fmtChange(data?.kpis?.netProfit?.change ?? 0),
          isPositive: Number(finance.netProfit || 0) >= 0,
          icon: TrendingUp,
          color: "text-blue-500",
          bgColor: "from-blue-500/20",
        },
        {
          title: "Total validé CA",
          value: fmt(Number(finance.totalValidatedCA || 0)),
          subtitle: "Bénéfice encaissé",
          isPositive: true,
          icon: CheckCircle,
          color: "text-emerald-600",
          bgColor: "from-emerald-600/20",
        },
        {
          title: "Dépenses",
          value: fmt(Number(finance.totalExpenses || 0)),
          subtitle: "Livraison + Stock + Charges",
          isPositive: false,
          icon: TrendingDown,
          color: "text-rose-500",
          bgColor: "from-rose-500/20",
        },
        {
          title: "Frais livraison",
          value: fmt(Number(finance.totalDeliveryFees || 0)),
          isPositive: false,
          icon: Truck,
          color: "text-orange-500",
          bgColor: "from-orange-500/20",
        },
        {
          title: "Frais retour",
          value: fmt(Number(finance.totalReturnFees || 0)),
          isPositive: false,
          icon: Repeat,
          color: "text-rose-400",
          bgColor: "from-rose-400/20",
        },
        {
          title: "Paiements reçus",
          value: fmt(Number(finance.paidAmount || 0)),
          subtitle: "Fonds validés",
          isPositive: true,
          icon: Wallet,
          color: "text-indigo-500",
          bgColor: "from-indigo-500/20",
        },
        {
          title: "Reste à payer",
          value: fmt(Number(finance.remainingAmount || 0)),
          subtitle: "Balance profit/paiement",
          isPositive: Number(finance.remainingAmount || 0) >= 0,
          icon: CreditCard,
          color: "text-amber-500",
          bgColor: "from-amber-500/20",
        },
        {
          title: "Commandes",
          value: fmt(Number(finance.deliveredOrdersCount || 0), true),
          subtitle: "Livrées uniquement",
          isPositive: true,
          icon: ShoppingCart,
          color: "text-violet-500",
          bgColor: "from-violet-500/20",
        },
        {
          title: "Stock Faible",
          value: fmt(data?.kpis?.products?.lowStock ?? 0, true),
          subtitle: "produits",
          isPositive: false,
          icon: AlertTriangle,
          color: "text-red-500",
          bgColor: "from-red-500/20",
        },
      ]
    : [];

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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpiDefs.map((kpi) => (
              <div
                key={kpi.title}
                className="card-hover kpi-glow p-5 lg:p-6 rounded-xl bg-card border border-border/50"
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    {kpi.title}
                  </p>
                  <div className={cn("p-2 rounded-lg bg-gradient-to-br opacity-20", kpi.color.replace("text-", "from-").replace("-500", "-500/20"))}>
                    <kpi.icon className={cn("h-5 w-5", kpi.color)} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-2xl lg:text-3xl font-bold font-mono tracking-tight count-animate">
                    {kpi.value}
                  </h2>
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full",
                      ("neutral" in kpi && kpi.neutral)
                        ? "bg-muted/50 text-muted-foreground"
                        : kpi.isPositive
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-rose-500/10 text-rose-500"
                    )}
                  >
                    <TrendIcon positive={kpi.isPositive} neutral={("neutral" in kpi && kpi.neutral as boolean) || false} />
                    {kpi.change}
                  </span>
                  <span className="text-muted-foreground/60 text-xs">
                    vs mois dernier
                  </span>
                </div>
              </div>
            ))}
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