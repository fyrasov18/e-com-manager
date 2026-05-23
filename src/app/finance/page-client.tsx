"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { 
  DollarSign, Truck, AlertCircle, RefreshCw, CheckCircle, 
  ChevronRight, Download, Eye, Pencil, Trash2, 
  Search, ArrowUpCircle, Wallet, TrendingUp,
  TrendingDown, CreditCard
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getOrderStatusClassName, getOrderStatusLabel } from "@/lib/delivery-status";

interface FinanceData {
  chiffreAffaires: number;
  totalValidatedCA: number;
  totalDeliveryFees: number;
  totalReturnFees: number;
  totalWithholdingTax: number;
  netProfit: number;
  totalExpenses: number;
  paidAmount: number;
  remainingAmount: number;
  deliveredOrdersCount: number;
  returnedOrdersCount: number;
  byProvider: {
    provider: string;
    chiffreAffaires: number;
    deliveryFees: number;
    returnFees: number;
    withholdingTax: number;
    netProfit: number;
    paidAmount: number;
    orderCount: number;
    deliveredCount: number;
    returnedCount: number;
    remainingAmount: number;
    averageOrderValue: number;
    marginRate: number;
  }[];
}

interface DeliverySetting {
  provider: string;
  deliveryCost: number;
  returnCost: number;
  withholdingTaxPercent: number;
}

interface Revenue {
  id: string;
  orderId: string;
  orderStatus: string | null;
  revenueId: string | null;
  provider: string;
  trackingNumber: string | null;
  reference: string;
  customerName: string | null;
  amount: number;
  deliveryFee: number;
  returnFee: number;
  withholdingTaxApplied: number;
  apiStatus: string | null;
  paymentNumber: string | null;
  paymentStatus: string | null;
  isValidated: boolean;
  importedAt: string;
  validatedAt: string | null;
  operationDate: string | null;
}


const PROVIDER_LABELS: Record<string, string> = {
  COLISSIMO: "Colissimo",
  INSTADELIVERY: "InstaDelivery",
};

function formatMoney(value: number | null | undefined) {
  return `${(value ?? 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} DT`;
}

function formatPercent(value: number | null | undefined) {
  return `${(value ?? 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })} %`;
}

export default function FinancePage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [settings, setSettings] = useState<DeliverySetting[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [resyncing, setResyncing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'revenues' | 'settings'>('overview');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const revenuesUrl = `/api/delivery-revenue${search ? `?search=${encodeURIComponent(search)}` : ""}`;
      const [resF, resS, resR] = await Promise.all([
        fetch("/api/finance"),
        fetch("/api/delivery-settings"),
        fetch(revenuesUrl)
      ]);
      const jsonF = await resF.json();
      const jsonS = await resS.json();
      const jsonR = await resR.json();
      
      if (!resF.ok || !jsonF.success) {
        throw new Error(jsonF.message || "Erreur chargement finance");
      }
      if (jsonF.success) setData(jsonF.data);
      if (jsonS.success) {
        setSettings(
          (jsonS.settings || []).map((setting: DeliverySetting) => ({
            ...setting,
            withholdingTaxPercent: setting.withholdingTaxPercent ?? 0,
          }))
        );
      }
      if (jsonR.revenues) setRevenues(jsonR.revenues);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Impossible de charger les données finance");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Voulez-vous vraiment réinitialiser les données financières de ${selectedIds.length} paiement(s) sélectionné(s) ?\nLes commandes resteront dans le système mais leurs montants validés seront remis à zéro.`)) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/delivery-revenue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (res.ok) {
        setSelectedIds([]);
        await loadData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === revenues.length) setSelectedIds([]);
    else setSelectedIds(revenues.map(r => r.id));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  async function handleValidate(revId: string, revenueIdInDb?: string | null) {
    // If we have a direct revenueIdInDb, use it, otherwise validation might fail or need orderId
    const targetId = revenueIdInDb || revId;
    setValidating(revId);
    try {
      const res = await fetch("/api/delivery-revenue/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", revenueId: targetId }),
      });
      if (res.ok) await loadData();
    } catch (e) {
      console.error(e);
    }
    setValidating(null);
  }

  async function handleResync(revId: string, revenueIdInDb?: string | null) {
    const targetId = revenueIdInDb || revId;
    setResyncing(revId);
    try {
      const res = await fetch("/api/delivery-revenue/resync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revenueId: targetId }),
      });
      if (res.ok) await loadData();
    } catch (e) {
      console.error(e);
    }
    setResyncing(null);
  }

  async function handleSettingSave(
    provider: string,
    deliveryCost: number,
    returnCost: number,
    withholdingTaxPercent: number
  ) {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/delivery-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, deliveryCost, returnCost, withholdingTaxPercent }),
      });
      if (res.ok) await loadData();
    } catch (e) {
      console.error(e);
    }
    setSavingSettings(false);
  }

  if (loading && !data) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <RefreshCw className="animate-spin text-primary w-10 h-10" />
        <p className="text-muted-foreground font-medium animate-pulse">Chargement de vos finances...</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
              <Wallet className="w-6 h-6" />
            </div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-foreground">
              Finance <span className="text-primary">&</span> Revenus
            </h1>
          </div>
          <p className="text-muted-foreground max-w-md">
            Gérez vos flux de trésorerie, vos créances et vos paramètres de livraison en un seul endroit.
          </p>
        </div>
        
        <div className="flex items-center gap-3 self-start md:self-end">
          <button 
            onClick={() => loadData()} 
            className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-semibold hover:bg-secondary/80 transition-all border border-border/50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> 
            {loading ? "Actualisation..." : "Actualiser"}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-2xl w-fit border border-border/50">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<DollarSign className="w-4 h-4" />} label="Vue d'ensemble" />
        <TabButton active={activeTab === 'revenues'} onClick={() => setActiveTab('revenues')} icon={<Truck className="w-4 h-4" />} label="Détail des Revenus" />
        <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Pencil className="w-4 h-4" />} label="Paramètres Coûts" />
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-bold">Chargement incomplet</p>
            <p className="text-rose-200/80">{error}</p>
          </div>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Main Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="Chiffre d'Affaires (CA)" 
              value={data?.chiffreAffaires} 
              subtitle={`${data?.deliveredOrdersCount || 0} commandes livrées`} 
              icon={<DollarSign className="w-5 h-5 text-emerald-500"/>} 
            />
            <StatCard 
              title="Bénéfice Net" 
              value={data?.netProfit} 
              subtitle="Profit total après toutes déductions" 
              icon={<TrendingUp className="w-5 h-5 text-blue-500"/>} 
              highlight 
            />
            <StatCard 
              title="Total validé CA" 
              value={data?.totalValidatedCA} 
              subtitle="Bénéfice encaissé et validé" 
              icon={<CheckCircle className="w-5 h-5 text-emerald-600"/>} 
            />
            <StatCard 
              title="Dépenses" 
              value={data?.totalExpenses} 
              subtitle="Livraison + Retour + Retenue + Achat + Charges" 
              icon={<TrendingDown className="w-5 h-5 text-rose-500"/>} 
            />
            <StatCard 
              title="Paiements Reçus" 
              value={data?.paidAmount} 
              subtitle="Total des fonds validés" 
              icon={<Wallet className="w-5 h-5 text-indigo-500"/>} 
            />
            <StatCard 
              title="Reste à Payer" 
              value={data?.remainingAmount} 
              subtitle="Balance profit/paiement" 
              icon={<CreditCard className="w-5 h-5 text-amber-500"/>} 
              warning={data?.remainingAmount ? data.remainingAmount > 1000 : false}
            />
            <StatCard 
              title="Frais de Livraison" 
              value={data?.totalDeliveryFees} 
              subtitle="Coût total des envois réussis" 
              icon={<Truck className="w-5 h-5 text-orange-500"/>} 
            />
            <StatCard 
              title="Frais de Retour" 
              value={data?.totalReturnFees} 
              subtitle={`${data?.returnedOrdersCount || 0} colis retournés`} 
              icon={<AlertCircle className="w-5 h-5 text-rose-400"/>} 
            />
            <StatCard
              title="Retenue Source"
              value={data?.totalWithholdingTax}
              subtitle="Pourcentage applique aux livraisons"
              icon={<CreditCard className="w-5 h-5 text-fuchsia-500"/>}
            />
          </div>

          {/* Provider Performance */}
          <div className="bg-card border border-border/60 shadow-xl shadow-black/5 rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-border/60 bg-muted/20 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                   <ChevronRight className="w-4 h-4 text-primary" />
                </div>
                Performance par Société
              </h2>
            </div>
            <div className="p-6">
              {(data?.byProvider?.length ?? 0) === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 p-10 text-center">
                  <p className="font-bold text-muted-foreground">Aucune performance disponible</p>
                  <p className="mt-1 text-sm text-muted-foreground/70">
                    Les sociétés apparaîtront ici dès qu&apos;une commande livrée ou retournée sera synchronisée.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data?.byProvider.map((p) => {
                    const progress = p.chiffreAffaires > 0
                      ? Math.min(100, Math.max(0, (p.paidAmount / p.chiffreAffaires) * 100))
                      : 0;

                    return (
                      <div key={p.provider} className="group relative border border-border/60 rounded-2xl p-6 bg-background hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/5">
                        <div className="flex items-center justify-between gap-4 mb-6">
                          <div className="space-y-1">
                            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/60">Société</span>
                            <h3 className="text-xl font-extrabold">{PROVIDER_LABELS[p.provider] || p.provider}</h3>
                          </div>
                          <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center text-xl font-bold">
                            {(PROVIDER_LABELS[p.provider] || p.provider).charAt(0)}
                          </div>
                        </div>

                        <div className="mb-6 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            <span>Encaissement</span>
                            <span>{formatPercent(progress)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <MetricTile label="Commandes" value={`${p.orderCount || 0}`} />
                          <MetricTile label="Livrées / Retours" value={`${p.deliveredCount || 0} / ${p.returnedCount || 0}`} />
                          <MetricTile label="CA" value={formatMoney(p.chiffreAffaires)} tone="emerald" />
                          <MetricTile label="Validé" value={formatMoney(p.paidAmount)} tone="indigo" />
                          <MetricTile label="À encaisser" value={formatMoney(p.remainingAmount)} tone="amber" />
                          <MetricTile label="Bénéfice net" value={formatMoney(p.netProfit)} tone="blue" />
                          <MetricTile label="Frais livraison" value={formatMoney(p.deliveryFees)} tone="orange" />
                          <MetricTile label="Retenue source" value={formatMoney(p.withholdingTax)} tone="fuchsia" />
                          <MetricTile label="Panier moyen" value={formatMoney(p.averageOrderValue)} />
                          <MetricTile label="Marge" value={formatPercent(p.marginRate)} tone={p.marginRate >= 0 ? "emerald" : "rose"} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'revenues' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-card border border-border/60 shadow-xl rounded-3xl overflow-hidden">
            <div className="p-6 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold">Détail des Paiements Importés</h2>
                {selectedIds.length > 0 && (
                  <button 
                    onClick={handleBulkDelete}
                    disabled={deleting}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-600 transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Supprimer sélection ({selectedIds.length})
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input 
                    type="text" 
                    placeholder="Rechercher tracking, client..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-muted/50 border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-full sm:w-64"
                  />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/60">
                    <th className="px-6 py-4 w-12">
                      <input 
                        type="checkbox" 
                        checked={revenues.length > 0 && selectedIds.length === revenues.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-border bg-muted accent-primary cursor-pointer"
                      />
                    </th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Société</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Tracking / Client</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Date Opé.</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Montant</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Frais</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Statut commande</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Validation</th>
                    <th className="px-6 py-4 font-bold text-muted-foreground uppercase tracking-wider text-[10px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {revenues.map(rev => {
                    const isSelected = selectedIds.includes(rev.id);
                    return (
                      <tr key={rev.id} className={cn("hover:bg-muted/20 transition-colors group", isSelected && "bg-primary/5")}>
                        <td className="px-6 py-4">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleSelect(rev.id)}
                            className="h-4 w-4 rounded border-border bg-muted accent-primary cursor-pointer"
                          />
                        </td>
                        <td className="px-6 py-4 font-medium">
                           <span className={cn(
                             "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border",
                             String(rev.provider).includes('COLISSIMO') ? "bg-blue-500/10 text-blue-600 border-blue-500/20" : "bg-purple-500/10 text-purple-600 border-purple-500/20"
                           )}>
                             {PROVIDER_LABELS[rev.provider] || rev.provider}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-mono text-xs font-bold text-foreground">{rev.trackingNumber || rev.reference}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{rev.customerName || 'Client inconnu'}</div>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-muted-foreground whitespace-nowrap">
                          {rev.operationDate ? new Date(rev.operationDate).toLocaleDateString("fr-FR") : "—"}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-foreground">{(rev.amount || 0).toFixed(2)} DT</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs text-muted-foreground">L: {(rev.deliveryFee || 0).toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">R: {(rev.returnFee || 0).toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">RS: {(rev.withholdingTaxApplied || 0).toFixed(2)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn("badge-status border text-[11px] whitespace-nowrap", getOrderStatusClassName(rev.orderStatus))}>
                            {getOrderStatusLabel(rev.orderStatus)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {rev.isValidated ? (
                            <div className="flex items-center gap-1.5 text-emerald-500 font-bold text-xs">
                              <CheckCircle className="w-3.5 h-3.5" /> Validé
                            </div>
                          ) : (
                            <div className="text-muted-foreground/60 text-xs italic">En attente</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/orders?id=${encodeURIComponent(rev.orderId)}`}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                              title="Voir commande"
                            >
                              <Eye className="w-4 h-4" />
                              Voir commande
                            </Link>
                            {!rev.isValidated && (
                              <button 
                                onClick={() => handleValidate(rev.id, rev.revenueId)}
                                disabled={validating === rev.id}
                                className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg hover:bg-emerald-500/20 transition-colors"
                                title="Valider le paiement"
                              >
                                {validating === rev.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
                              </button>
                            )}
                            <button 
                              onClick={() => handleResync(rev.id, rev.revenueId)}
                              disabled={resyncing === rev.id}
                              className="p-2 bg-blue-500/10 text-blue-600 rounded-lg hover:bg-blue-500/20 transition-colors"
                              title="Synchroniser API"
                            >
                              <RefreshCw className={cn("w-4 h-4", resyncing === rev.id && "animate-spin")} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {revenues.length === 0 && (
              <div className="p-20 text-center space-y-4">
                <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto">
                  <Truck className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-lg font-bold text-muted-foreground">Aucun paiement trouvé</p>
                  <p className="text-sm text-muted-foreground/60">Importez vos codes-barres pour voir les détails financiers.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6 animate-in fade-in duration-500">
           <div className="bg-card border border-border/60 shadow-xl rounded-3xl overflow-hidden max-w-4xl">
            <div className="p-6 border-b border-border/60 bg-muted/20">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <Pencil className="w-5 h-5 text-primary" /> Configuration des Tarifs
              </h2>
            </div>
            <div className="p-6 space-y-8">
              {settings.map(s => (
                <div key={s.provider} className="space-y-4 pb-8 border-b border-border/40 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-foreground">{PROVIDER_LABELS[s.provider] || s.provider}</h3>
                    <div className="px-3 py-1 rounded-full bg-primary/5 text-primary text-[10px] font-black uppercase tracking-tighter border border-primary/10">Actif</div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-muted-foreground uppercase tracking-widest">Coût Livraison (DT)</label>
                      <input 
                        type="number" 
                        defaultValue={s.deliveryCost} 
                        id={`delivery-${s.provider}`}
                        className="w-full px-4 py-3 bg-muted/30 border border-border/60 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-muted-foreground uppercase tracking-widest">Coût Retour (DT)</label>
                      <input 
                        type="number" 
                        defaultValue={s.returnCost} 
                        id={`return-${s.provider}`}
                        className="w-full px-4 py-3 bg-muted/30 border border-border/60 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-muted-foreground uppercase tracking-widest">Retenue Source (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        defaultValue={s.withholdingTaxPercent}
                        id={`withholding-${s.provider}`}
                        className="w-full px-4 py-3 bg-muted/30 border border-border/60 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                  </div>
                  
                  <button 
                    disabled={savingSettings}
                    onClick={() => {
                      const d = parseFloat((document.getElementById(`delivery-${s.provider}`) as HTMLInputElement).value);
                      const r = parseFloat((document.getElementById(`return-${s.provider}`) as HTMLInputElement).value);
                      const w = parseFloat((document.getElementById(`withholding-${s.provider}`) as HTMLInputElement).value);
                      handleSettingSave(s.provider, d, r, w);
                    }}
                    className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                  >
                    {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Enregistrer les Tarifs
                  </button>
                </div>
              ))}
            </div>
           </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300",
        active 
          ? "bg-background text-primary shadow-sm shadow-black/5 border border-border/40" 
          : "text-muted-foreground hover:text-foreground hover:bg-background/40"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "indigo" | "amber" | "blue" | "orange" | "fuchsia" | "rose";
}) {
  const toneClasses = {
    emerald: "bg-emerald-500/5 text-emerald-600",
    indigo: "bg-indigo-500/5 text-indigo-500",
    amber: "bg-amber-500/5 text-amber-600",
    blue: "bg-blue-500/5 text-blue-600",
    orange: "bg-orange-500/5 text-orange-600",
    fuchsia: "bg-fuchsia-500/5 text-fuchsia-600",
    rose: "bg-rose-500/5 text-rose-600",
  };
  const toneClass = tone ? toneClasses[tone] : "bg-muted/30 text-foreground";

  return (
    <div className={cn("p-3 rounded-xl", toneClass)}>
      <p className="text-xs font-semibold opacity-75 mb-1">{label}</p>
      <p className="text-lg font-bold font-mono leading-tight break-words">{value}</p>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon, highlight = false, trend, warning }: any) {
  return (
    <div className={cn(
      "relative group p-6 rounded-[2.5rem] border shadow-sm flex flex-col justify-between transition-all duration-500 hover:shadow-2xl hover:-translate-y-1", 
      highlight 
        ? "bg-gradient-to-br from-primary to-blue-700 text-primary-foreground border-primary/20 shadow-primary/20" 
        : "bg-card border-border/60 hover:border-primary/30"
    )}>
      {trend && (
        <div className={cn(
          "absolute top-6 right-6 px-2 py-0.5 rounded-full text-[10px] font-black tracking-tighter flex items-center gap-1",
          highlight ? "bg-white/20 text-white" : "bg-emerald-500/10 text-emerald-600"
        )}>
          <ArrowUpCircle className="w-3 h-3" /> {trend}
        </div>
      )}
      
      <div className="mb-8">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 duration-500",
          highlight ? "bg-white/20" : "bg-muted/50 border border-border/40"
        )}>
          {icon}
        </div>
        <h3 className={cn("text-xs font-black uppercase tracking-[0.2em] mb-2", highlight ? "text-white/70" : "text-muted-foreground/60")}>
          {title}
        </h3>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl lg:text-4xl font-black font-mono tracking-tighter">
            {value != null ? value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
          </span>
          <span className={cn("text-sm font-bold", highlight ? "text-white/60" : "text-muted-foreground/40")}>DT</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-current/10">
        <p className={cn("text-[10px] font-bold uppercase tracking-wider", highlight ? "text-white/60" : "text-muted-foreground/50")}>
          {subtitle}
        </p>
        {warning && (
          <div className="flex items-center gap-1 text-amber-500 animate-pulse">
            <AlertCircle className="w-3 h-3" />
            <span className="text-[10px] font-black uppercase tracking-tighter">Attention</span>
          </div>
        )}
      </div>
    </div>
  );
}
