"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ShoppingCart, RefreshCw, Search, X, Pencil, Trash2, Wifi, WifiOff, Upload, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { MANUAL_ORDER_STATUS_OPTIONS, ORDER_STATUS_OPTIONS, isReturnStatus, isDeliveredStatus, getOrderStatusClassName, getOrderStatusLabel } from "@/lib/delivery-status";
import { parseTrackingCodes } from "@/lib/tracking-utils";

type Order = {
  id: string; status: string; revenue: number; date: string;
  customerName: string | null; customerPhone: string | null;
  shippingAddress: string | null; shippingCity: string | null;
  trackingNumber: string | null; reference: string | null;
  shippingProvider: string | null; apiStatus: string | null;
  paymentNumber: string | null; deliveryFee: number | null;
  returnFee: number | null;
  deliveryType: string | null;
  isManualOrder: boolean;
  paymentStatus: string | null;
  notes: string | null;
  productName: string | null;
  quantity: number;
  validatedRevenue: number | null;
  deliveryCostApplied: number | null;
  returnCostApplied: number | null;
  withholdingTaxApplied: number | null;
  netProfit: number | null;
  operationDate: string | null;
};

const PROV: Record<string, { label: string; cls: string }> = {
  COLISSIMO: { label: "Colissimo", cls: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  INSTADELIVERY: { label: "InstaDelivery", cls: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
  MANUAL_SENDER: { label: "Manuelle", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
};

const EMPTY_MANUAL_FORM = {
  customerName: "",
  customerPhone: "",
  customerAddress: "",
  productName: "",
  quantity: "1",
  orderAmount: "",
  deliveryFee: "0",
  paymentStatus: "PENDING",
  orderStatus: "PENDING",
  notes: "",
};
export default function OrdersPage() {
  const searchParams = useSearchParams();
  const targetOrderId = searchParams.get("id")?.trim() ?? "";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>({ isSyncing: false, lastSyncAt: null });
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importProvider, setImportProvider] = useState<"COLISSIMO" | "INSTADELIVERY">("COLISSIMO");
  const [importInput, setImportInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [savingManualOrder, setSavingManualOrder] = useState(false);
  const [manualEditingOrder, setManualEditingOrder] = useState<Order | null>(null);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (targetOrderId) params.set("id", targetOrderId);
    if (!targetOrderId && providerFilter) params.set("provider", providerFilter);
    if (!targetOrderId && search) params.set("search", search);
    try {
      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();
      console.log("[Orders Fetch] orders", data.total ?? data.orders?.length ?? 0);
      setOrders(data.orders ?? []);
      setSelectedIds([]); // On reset la sélection au rechargement
    } catch { setErr("Erreur chargement"); }
    setLoading(false);
  }, [providerFilter, search, targetOrderId]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === orders.length) setSelectedIds([]);
    else setSelectedIds(orders.map(o => o.id));
  };

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Supprimer les ${selectedIds.length} commandes sélectionnées ?`)) return;
    
    setBulkDeleting(true);
    try {
      const r = await fetch(`/api/orders?id=${selectedIds.join(",")}`, { method: "DELETE" });
      const data = await r.json();
      if (data.success) {
        toast(`✓ ${data.message || "Supprimées"}`);
        setSelectedIds([]);
        await loadOrders();
      } else {
        toast(data.error || "Erreur lors de la suppression", false);
      }
    } catch {
      toast("Erreur réseau", false);
    }
    setBulkDeleting(false);
  }

  const loadSync = useCallback(async () => {
    try { const r = await fetch("/api/delivery/sync"); if (r.ok) setSyncStatus(await r.json()); } catch {}
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => { loadSync(); }, [loadSync]);
  useEffect(() => { timerRef.current = setInterval(() => { loadOrders(); loadSync(); }, 60000); return () => { if (timerRef.current) clearInterval(timerRef.current); }; }, [loadOrders, loadSync]);

  function toast(m: string, ok = true) { if (ok) { setMsg(m); setErr(""); } else { setErr(m); setMsg(""); } setTimeout(() => { setMsg(""); setErr(""); }, 5000); }

  async function handleSync() {
    setSyncing(true);
    console.log("[Orders Sync] click synchronize");
    try {
      const r = await fetch("/api/delivery/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await r.json();
      console.log("[Orders Sync] response", data);
      if (data.success) { toast(`✓ ${data.message}`); await loadOrders(); await loadSync(); }
      else toast(data.message || "Sync impossible — aucun tracking en base", false);
    } catch { toast("Erreur sync", false); }
    setSyncing(false);
  }

  const detectedCodes = useMemo(() => parseTrackingCodes(importInput), [importInput]);

  async function handleImport() {
    if (!detectedCodes.length) { toast("Entrez au moins un code", false); return; }
    setImporting(true); setImportResult(null);
    try {
      const r = await fetch("/api/orders/import-tracking", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: importProvider, trackingNumbers: detectedCodes }),
      });
      const data = await r.json();
      if (data.success) { setImportResult(data.results); toast(`✓ ${data.message}`); await loadOrders(); setImportInput(""); }
      else toast(data.message || "Erreur import", false);
    } catch { toast("Erreur réseau", false); }
    setImporting(false);
  }

  function openManualOrderModal(order?: Order) {
    setErr("");
    setMsg("");
    setManualEditingOrder(order ?? null);
    setManualForm(order ? {
      customerName: order.customerName ?? "",
      customerPhone: order.customerPhone ?? "",
      customerAddress: order.shippingAddress ?? "",
      productName: order.productName ?? "",
      quantity: String(order.quantity || 1),
      orderAmount: String(order.revenue ?? ""),
      deliveryFee: String(order.deliveryFee ?? order.deliveryCostApplied ?? order.returnFee ?? order.returnCostApplied ?? 0),
      paymentStatus: order.paymentStatus ?? "PENDING",
      orderStatus: order.status ?? "PENDING",
      notes: order.notes ?? "",
    } : EMPTY_MANUAL_FORM);
    setShowManualOrder(true);
  }

  async function handleManualOrderSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingManualOrder(true);
    try {
      const payload = {
        customerName: manualForm.customerName,
        customerPhone: manualForm.customerPhone,
        customerAddress: manualForm.customerAddress,
        productName: manualForm.productName,
        quantity: Number(manualForm.quantity),
        orderAmount: Number(manualForm.orderAmount),
        deliveryFee: Number(manualForm.deliveryFee),
        paymentStatus: manualForm.paymentStatus,
        orderStatus: manualForm.orderStatus,
        notes: manualForm.notes,
      };
      const r = await fetch(manualEditingOrder ? `/api/orders?id=${manualEditingOrder.id}` : "/api/orders", {
        method: manualEditingOrder ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (data.success) {
        toast(manualEditingOrder ? "Commande manuelle modifiée" : "Commande manuelle ajoutée");
        setShowManualOrder(false);
        setManualEditingOrder(null);
        setManualForm(EMPTY_MANUAL_FORM);
        await loadOrders();
      } else {
        toast(data.error || data.issues?.[0]?.message || "Erreur commande manuelle", false);
      }
    } catch {
      toast("Erreur réseau", false);
    }
    setSavingManualOrder(false);
  }

  async function validateManualPayment(order: Order) {
    try {
      const r = await fetch(`/api/orders?id=${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "VALIDATE_PAYMENT" }),
      });
      const data = await r.json();
      if (data.success) {
        toast("Paiement validé");
        await loadOrders();
      } else {
        toast(data.error || "Validation impossible", false);
      }
    } catch {
      toast("Erreur réseau", false);
    }
  }

  async function handleDelete(o: Order) {
    setDeleting(o.id);
    try {
      const r = await fetch(`/api/orders?id=${o.id}`, { method: "DELETE" });
      if (r.ok) { toast("Supprimé"); setConfirmDelete(null); await loadOrders(); } else toast("Erreur", false);
    } catch { toast("Erreur", false); }
    setDeleting(null);
  }

  async function handleEdit() {
    if (!editOrder) return;
    try {
      const r = await fetch(`/api/orders?id=${editOrder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: editStatus }) });
      if (r.ok) { toast("Modifié ✓"); setEditOrder(null); await loadOrders(); } else toast("Erreur", false);
    } catch { toast("Erreur", false); }
  }

  const stats = {
    total: orders.length,
    delivered: orders.filter(o => isDeliveredStatus(o.status)).length,
    pending: orders.filter(o => !isDeliveredStatus(o.status) && !isReturnStatus(o.status) && ["PENDING","IN_DELIVERY","PICKED_UP","IN_DEPOT","READY_FOR_PICKUP"].includes(o.status)).length,
    returned: orders.filter(o => isReturnStatus(o.status)).length,
    revenue: orders.filter(o => !isReturnStatus(o.status)).reduce((s, o) => s + (o.revenue || 0), 0),
  };

  return (
    <div className="space-y-5 pb-20">
      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-[100] space-y-2 pointer-events-none">
        {msg && <div className="px-4 py-3 rounded-xl text-sm font-medium shadow-xl border bg-emerald-500/20 text-emerald-300 border-emerald-500/30 pointer-events-auto">{msg}</div>}
        {err && <div className="px-4 py-3 rounded-xl text-sm font-medium shadow-xl border bg-rose-500/20 text-rose-300 border-rose-500/30 pointer-events-auto">{err}</div>}
      </div>

      {/* Bulk Delete Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-4 px-6 py-3 rounded-2xl bg-card border border-border shadow-2xl">
            <span className="text-sm font-medium">
              <span className="text-primary">{selectedIds.length}</span> commande(s) sélectionnée(s)
            </span>
            <div className="h-4 w-px bg-border mx-2" />
            <button 
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-2 text-sm font-bold text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-50"
            >
              <Trash2 className={cn("h-4 w-4", bulkDeleting && "animate-pulse")} />
              {bulkDeleting ? "Suppression..." : "Supprimer"}
            </button>
            <button onClick={() => setSelectedIds([])} className="p-1 hover:bg-muted rounded-full transition-colors"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><ShoppingCart className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold">Commandes reçues</h1>
            <p className="text-xs text-muted-foreground">Synchronisées depuis Colissimo et InstaDelivery</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => openManualOrderModal()} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" /> Add Manual Order
          </button>
          <button onClick={() => { setShowImport(true); setImportResult(null); }} className="btn-secondary flex items-center gap-2 text-sm">
            <Upload className="h-4 w-4" /> Importer tracking
          </button>
          <button onClick={handleSync} disabled={syncing || syncStatus.isSyncing} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={cn("h-4 w-4", (syncing || syncStatus.isSyncing) && "animate-spin")} />
            {syncing || syncStatus.isSyncing ? "Sync..." : "Synchroniser"}
          </button>
        </div>
      </div>

      {/* Sync bar */}
      <div className={cn("flex items-center gap-2 px-4 py-2 rounded-xl border text-xs",
        syncStatus.isSyncing ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
        : syncStatus.lastSyncAt ? "bg-muted/30 border-border text-muted-foreground"
        : "bg-amber-500/10 border-amber-500/30 text-amber-400")}>
        {syncStatus.isSyncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : syncStatus.lastSyncAt ? <Wifi className="h-3 w-3 text-emerald-400" /> : <WifiOff className="h-3 w-3" />}
        {syncStatus.isSyncing ? "Synchronisation en cours..." : syncStatus.lastSyncAt ? `Dernière sync : ${new Date(syncStatus.lastSyncAt).toLocaleString("fr-FR")}` : "Aucune sync — importez d'abord des tracking via le bouton « Importer tracking »"}
        {orders.length === 0 && !syncStatus.isSyncing && <span className="ml-auto font-medium text-amber-400">↑ Commencez par importer des codes barres</span>}
      </div>

      {targetOrderId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <div>
            <p className="font-bold text-primary">Commande ciblée depuis Finance</p>
            <p className="font-mono text-xs text-muted-foreground">{targetOrderId}</p>
          </div>
          <Link href="/orders" className="btn-secondary text-xs">
            Afficher toutes les commandes
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[["Total", stats.total, "text-foreground"], ["Livrées", stats.delivered, "text-emerald-400"], ["En cours", stats.pending, "text-blue-400"], ["Retours", stats.returned, "text-rose-400"], [`${stats.revenue.toFixed(0)} DT`, null, "text-primary"]].map(([label, val, cls], i) => (
          <div key={i} className="p-3 rounded-xl bg-card border border-border">
            <p className="text-xs text-muted-foreground mb-1">{i === 4 ? "Revenu brut" : label}</p>
            <p className={cn("text-xl font-bold font-mono", cls as string)}>{i === 4 ? label : val}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tracking, client, ville..." className="input-base pl-9" />
        </div>
        <select value={providerFilter} onChange={e => setProviderFilter(e.target.value)} className="input-base !w-auto">
          <option value="">Tous les prestataires</option>
          <option value="COLISSIMO">Colissimo</option>
          <option value="INSTADELIVERY">InstaDelivery</option>
          <option value="MANUAL_SENDER">Manuelle expéditeur</option>
        </select>
        {(search || providerFilter) && (
          <button onClick={() => { setSearch(""); setProviderFilter(""); }} className="btn-secondary flex items-center gap-1 text-xs">
            <X className="h-3.5 w-3.5" /> Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  <input 
                    type="checkbox" 
                    checked={orders.length > 0 && selectedIds.length === orders.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border bg-muted accent-primary cursor-pointer"
                  />
                </th>
                {["Société", "Tracking / Réf", "Date Opé.", "Client", "Montant", "Statut", "CA validé", "Frais Liv.", "Frais Ret.", "Ret. source", "Bénéfice Net", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={12} className="px-4 py-3"><div className="h-4 bg-muted/30 rounded animate-pulse" /></td></tr>)
              ) : orders.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-16 text-center text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Aucune commande trouvée</p>
                  <p className="text-xs mt-2 text-amber-400">Cliquez sur <strong>« Importer tracking »</strong> et collez vos codes barres Colissimo ou InstaDelivery</p>
                </td></tr>
              ) : orders.map(o => {
                const provCode = (o.deliveryType || o.shippingProvider || "").toUpperCase();
                let displayCode = "AUTRE";
                if (provCode.includes("COLISSIMO")) displayCode = "COLISSIMO";
                else if (provCode.includes("INSTA")) displayCode = "INSTADELIVERY";
                else if (provCode.includes("MANUAL")) displayCode = "MANUAL_SENDER";

                const prov = PROV[displayCode] ?? { label: o.shippingProvider ?? "—", cls: "text-muted-foreground bg-muted border-border" };
                const stCls = getOrderStatusClassName(o.status);
                const isSelected = selectedIds.includes(o.id);
                const isFocused = targetOrderId === o.id;
                return (
                  <tr key={o.id} className={cn("hover:bg-muted/20 transition-colors", isSelected && "bg-primary/5", isFocused && "bg-primary/10 ring-1 ring-inset ring-primary/30")}>
                    <td className="px-4 py-3">
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleSelect(o.id)}
                        className="h-4 w-4 rounded border-border bg-muted accent-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3"><span className={cn("badge-status border text-[11px]", prov.cls)}>{prov.label}</span></td>
                    <td className="px-4 py-3">
                      {o.trackingNumber && <p className="font-mono text-xs">{o.trackingNumber}</p>}
                      {o.reference && <p className="font-mono text-[11px] text-muted-foreground">{o.reference}</p>}
                      {o.isManualOrder && <p className="text-[11px] text-muted-foreground">Sans tracking API</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {o.operationDate ? new Date(o.operationDate).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-[130px]">{o.customerName || "—"}</p>
                      {o.customerPhone && <p className="text-xs text-muted-foreground">{o.customerPhone}</p>}
                      {o.productName && <p className="text-[11px] text-muted-foreground truncate max-w-[130px]">{o.quantity} x {o.productName}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">{o.revenue?.toFixed(2)} DT</td>
                    <td className="px-4 py-3"><span className={cn("badge-status border text-[11px] whitespace-nowrap", stCls)}>{getOrderStatusLabel(o.status)}</span></td>
                    
                    {/* Finance Columns */}
                    <td className="px-4 py-3 font-mono text-emerald-400">{o.validatedRevenue?.toFixed(2)} DT</td>
                    <td className="px-4 py-3 font-mono text-orange-400">{o.deliveryCostApplied?.toFixed(2)} DT</td>
                    <td className="px-4 py-3 font-mono text-rose-400">{o.returnCostApplied?.toFixed(2)} DT</td>
                    <td className="px-4 py-3 font-mono text-fuchsia-400">{o.withholdingTaxApplied?.toFixed(2)} DT</td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-400">{o.netProfit?.toFixed(2)} DT</td>

                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {o.isManualOrder && o.paymentStatus !== "VALIDATED" && (
                          <button onClick={() => validateManualPayment(o)} className="p-1.5 rounded hover:bg-emerald-500/10 transition-colors text-emerald-400" title="Valider paiement"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                        )}
                        <button onClick={() => { if (o.isManualOrder) openManualOrderModal(o); else { setEditOrder(o); setEditStatus(o.status); } }} className="p-1.5 rounded hover:bg-accent transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setConfirmDelete(o)} className="p-1.5 rounded hover:bg-rose-500/10 transition-colors text-muted-foreground hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">{orders.length} commande{orders.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Manual Order Modal */}
      {showManualOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setShowManualOrder(false)}>
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">{manualEditingOrder ? "Modifier commande manuelle" : "Add Manual Order"}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Livraison directe par expéditeur, sans tracking API ni prestataire externe.</p>
              </div>
              <button onClick={() => setShowManualOrder(false)} className="p-1.5 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>

            <form onSubmit={handleManualOrderSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Customer name">
                  <input required value={manualForm.customerName} onChange={e => setManualForm(f => ({ ...f, customerName: e.target.value }))} className="input-base" />
                </Field>
                <Field label="Customer phone">
                  <input required type="tel" value={manualForm.customerPhone} onChange={e => setManualForm(f => ({ ...f, customerPhone: e.target.value }))} className="input-base" />
                </Field>
              </div>

              <Field label="Customer address">
                <input required value={manualForm.customerAddress} onChange={e => setManualForm(f => ({ ...f, customerAddress: e.target.value }))} className="input-base" />
              </Field>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                <Field label="Product name">
                  <input required value={manualForm.productName} onChange={e => setManualForm(f => ({ ...f, productName: e.target.value }))} className="input-base" />
                </Field>
                <Field label="Quantity">
                  <input required min="1" type="number" value={manualForm.quantity} onChange={e => setManualForm(f => ({ ...f, quantity: e.target.value }))} className="input-base" />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Order amount">
                  <input required min="0" step="0.001" type="number" value={manualForm.orderAmount} onChange={e => setManualForm(f => ({ ...f, orderAmount: e.target.value }))} className="input-base" placeholder="0.000" />
                </Field>
                <Field label="Delivery fee">
                  <input min="0" step="0.001" type="number" value={manualForm.deliveryFee} onChange={e => setManualForm(f => ({ ...f, deliveryFee: e.target.value }))} className="input-base" placeholder="0.000" />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Payment status">
                  <select value={manualForm.paymentStatus} onChange={e => setManualForm(f => ({ ...f, paymentStatus: e.target.value }))} className="input-base">
                    <option value="PENDING">En attente</option>
                    <option value="RECEIVED">Paiement reçu</option>
                    <option value="VALIDATED">Paiement validé</option>
                  </select>
                </Field>
                <Field label="Order status">
                  <select value={manualForm.orderStatus} onChange={e => setManualForm(f => ({ ...f, orderStatus: e.target.value }))} className="input-base">
                    {MANUAL_ORDER_STATUS_OPTIONS.map(status => (
                      <option key={status} value={status}>{getOrderStatusLabel(status)}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Notes">
                <textarea rows={3} value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))} className="input-base resize-y" />
              </Field>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowManualOrder(false)} className="btn-secondary">Annuler</button>
                <button type="submit" disabled={savingManualOrder} className="btn-primary gap-2 disabled:opacity-50">
                  {savingManualOrder ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {manualEditingOrder ? "Enregistrer" : "Créer la commande"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setShowImport(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div><h2 className="font-bold">Importer des tracking</h2><p className="text-xs text-muted-foreground mt-0.5">Collez vos codes barres — un par ligne</p></div>
              <button onClick={() => { setShowImport(false); setImportResult(null); }} className="p-1.5 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Prestataire</label>
              <select value={importProvider} onChange={e => setImportProvider(e.target.value as "COLISSIMO" | "INSTADELIVERY")} className="input-base">
                <option value="COLISSIMO">Colissimo</option>
                <option value="INSTADELIVERY">InstaDelivery</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Codes barres <span className="text-muted-foreground">({detectedCodes.length} détectés)</span>
              </label>
              <textarea value={importInput} onChange={e => setImportInput(e.target.value)} rows={8} placeholder={"30047413627305\n30047413627306\n..."}
                className="input-base font-mono text-xs resize-y" />
            </div>
            {importResult && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["Créées", importResult.created, "text-emerald-400"], ["Mises à jour", importResult.updated, "text-blue-400"], ["Erreurs", importResult.failed, "text-rose-400"]].map(([l, v, c], i) => (
                    <div key={i} className="p-2 rounded-lg bg-muted/30 border border-border">
                      <p className={cn("text-lg font-bold font-mono", c as string)}>{v as number}</p>
                      <p className="text-[10px] text-muted-foreground">{l}</p>
                    </div>
                  ))}
                </div>
                {importResult.failed > 0 && importResult.details?.filter((d: any) => d.error).length > 0 && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 space-y-1 max-h-40 overflow-y-auto">
                    <p className="text-xs font-semibold text-rose-400 mb-1">Erreurs détectées :</p>
                    {importResult.details.filter((d: any) => d.error).slice(0, 10).map((d: any, i: number) => (
                      <div key={i} className="text-[11px] font-mono">
                        <span className="text-muted-foreground">{d.tracking}</span>
                        <span className="text-rose-300 ml-2">→ {d.error}</span>
                      </div>
                    ))}
                    {importResult.details.filter((d: any) => d.error).length > 10 && (
                      <p className="text-[11px] text-muted-foreground">... et {importResult.details.filter((d: any) => d.error).length - 10} autres</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowImport(false)} className="btn-secondary flex-1">Fermer</button>
              <button onClick={handleImport} disabled={importing || !importInput.trim()} className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2">
                {importing ? <><RefreshCw className="h-4 w-4 animate-spin" />Import...</> : <><Plus className="h-4 w-4" />Importer</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setEditOrder(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between"><h2 className="font-bold">Modifier statut local</h2><button onClick={() => setEditOrder(null)} className="p-1.5 rounded hover:bg-accent"><X className="h-4 w-4" /></button></div>
            <p className="text-xs text-amber-400">Modification locale — sera écrasée à la prochaine sync API</p>
            <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="input-base">
              {ORDER_STATUS_OPTIONS.map(s => <option key={s} value={s}>{getOrderStatusLabel(s)}</option>)}
            </select>
            <div className="flex gap-2"><button onClick={() => setEditOrder(null)} className="btn-secondary flex-1">Annuler</button><button onClick={handleEdit} className="btn-primary flex-1">Enregistrer</button></div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <h2 className="font-bold">Supprimer localement</h2>
            <p className="text-sm text-muted-foreground">Supprimer <strong>{confirmDelete.customerName || confirmDelete.trackingNumber}</strong> de la base locale ?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">Annuler</button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={deleting === confirmDelete.id} className="btn-danger flex-1 disabled:opacity-50 flex items-center justify-center gap-2">
                <Trash2 className="h-4 w-4" />{deleting === confirmDelete.id ? "..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
