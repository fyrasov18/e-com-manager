"use client";

import { FormEvent, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Truck,
  TestTube,
  RefreshCw,
  Upload,
  CheckCircle,
  AlertCircle,
  Package,
  Printer,
  Trash2,
  FileText,
  CreditCard,
  Search,
  ExternalLink,
  PlusCircle,
  Eye,
  EyeOff,
  ArrowLeft,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseTrackingCodes } from "@/lib/tracking-utils";
import { COSMOS_CITIES, type CosmosCity, cosmosStatusLabel } from "@/lib/cosmos-domain";

type CosmosConfigState = {
  configured: boolean;
  source: string;
  baseUrl: string;
  isActive: boolean;
  maskedToken: string;
  lastTested: string | null;
  lastError: string | null;
  lastSyncAt: string | null;
};

export default function CosmosPage() {
  const [cfg, setCfg] = useState<CosmosConfigState | null>(null);
  const [apiToken, setApiToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.cosmos.tn/api/v1");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [activeTab, setActiveTab] = useState<"import" | "create" | "orders" | "payments" | "track">("import");

  // Import State
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importErr, setImportErr] = useState("");
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    failed: number;
    details: { tracking: string; codeBar: string; status: string; error?: string; action?: string; amount?: number }[];
  } | null>(null);

  // Create Order State
  const [createForm, setCreateForm] = useState({
    name: "",
    phone: "",
    phone2: "",
    address: "",
    city: "Tunis" as CosmosCity,
    totalAmount: "",
    quantity: "1",
    packageCount: "1",
    content: "Article prêt-à-porter",
    note: "",
    externalBarcode: "",
    allowToOpen: true,
    isFragile: false,
    exchange: false,
  });
  const [creating, setCreating] = useState(false);
  const [createSuccessData, setCreateSuccessData] = useState<any | null>(null);

  // Orders List State
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSearchBarcode, setOrderSearchBarcode] = useState("");
  const [orderFilterPrinted, setOrderFilterPrinted] = useState<string>("all");

  // Payments State
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // Public Track State
  const [trackSearch, setTrackSearch] = useState("");
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackResult, setTrackResult] = useState<any | null>(null);
  const [trackError, setTrackError] = useState("");

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/cosmos");
      const data = await res.json();
      setCfg(data);
      if (data.baseUrl) setBaseUrl(data.baseUrl);
    } catch {
      setErr("Impossible de charger la configuration Cosmos.");
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const params = new URLSearchParams();
      if (orderSearchBarcode.trim()) params.set("barcode", orderSearchBarcode.trim());
      if (orderFilterPrinted === "printed") params.set("printed", "true");
      if (orderFilterPrinted === "not-printed") params.set("printed", "false");
      params.set("limit", "50");

      const res = await fetch(`/api/cosmos/orders?${params.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setOrders(data.data);
      } else {
        setOrders([]);
      }
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [orderSearchBarcode, orderFilterPrinted]);

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const res = await fetch("/api/cosmos/payments?limit=20");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setPayments(data.data);
      } else {
        setPayments([]);
      }
    } catch {
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (activeTab === "orders") {
      loadOrders();
    } else if (activeTab === "payments") {
      loadPayments();
    }
  }, [activeTab, loadOrders, loadPayments]);

  // Save config
  async function handleSaveConfig(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!cfg?.configured && !apiToken.trim()) {
      setErr("Token Bearer API requis.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/cosmos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          apiToken: apiToken.trim() || undefined,
          baseUrl: baseUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg(data.message || "Configuration enregistrée ✓");
        setApiToken("");
        await loadConfig();
      } else {
        setErr(data.message || "Erreur d'enregistrement.");
      }
    } catch {
      setErr("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  // Test connection
  async function handleTestConfig() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/cosmos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg(data.message);
      } else {
        setErr(data.message);
      }
      await loadConfig();
    } catch {
      setErr("Erreur réseau lors du test de connexion.");
    } finally {
      setBusy(false);
    }
  }

  // Delete config
  async function handleDeleteConfig() {
    if (!window.confirm("Supprimer définitivement la configuration Cosmos ?")) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/cosmos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg(data.message);
        await loadConfig();
      } else {
        setErr(data.message);
      }
    } catch {
      setErr("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  // Bulk Import
  async function handleImport() {
    const codes = parseTrackingCodes(importText);
    if (codes.length === 0) {
      setImportErr("Collez au moins un code barre (ex: 000000000012).");
      return;
    }

    setImporting(true);
    setImportErr("");
    setImportMsg("");
    setImportResult(null);

    try {
      const res = await fetch("/api/cosmos/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumbers: codes }),
      });
      const data = await res.json();
      if (!data.success && !data.results) {
        setImportErr(data.message || "Erreur lors de l'import.");
      } else {
        setImportResult(data.results ?? null);
        setImportMsg(data.message || "Import terminé.");
        if (data.results?.imported || data.results?.updated) {
          setImportText("");
        }
      }
    } catch (e: any) {
      setImportErr(e?.message || "Erreur réseau.");
    } finally {
      setImporting(false);
    }
  }

  // Create Order
  async function handleCreateOrder(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setErr("");
    setMsg("");
    setCreateSuccessData(null);

    try {
      const res = await fetch("/api/cosmos/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim(),
          phone: createForm.phone.trim(),
          phone2: createForm.phone2.trim() || undefined,
          address: createForm.address.trim(),
          city: createForm.city,
          totalAmount: parseFloat(createForm.totalAmount) || 0,
          quantity: parseInt(createForm.quantity) || 1,
          packageCount: parseInt(createForm.packageCount) || 1,
          content: createForm.content.trim(),
          note: createForm.note.trim() || undefined,
          externalBarcode: createForm.externalBarcode.trim() || undefined,
          exchange: createForm.exchange,
          options: {
            allowToOpen: createForm.allowToOpen,
            isFragile: createForm.isFragile,
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setMsg("Commande créée avec succès chez Cosmos Delivery !");
        setCreateSuccessData(data.data);
        setCreateForm((prev) => ({
          ...prev,
          name: "",
          phone: "",
          phone2: "",
          address: "",
          totalAmount: "",
          externalBarcode: "",
          note: "",
        }));
      } else {
        setErr(data.message || "Échec de création de commande.");
      }
    } catch (e: any) {
      setErr(e?.message || "Erreur réseau.");
    } finally {
      setCreating(false);
    }
  }

  // Mark printed
  async function handleMarkPrinted(barcode: string, printed: boolean) {
    try {
      const res = await fetch("/api/cosmos/printed", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcodes: [barcode], printed }),
      });
      const data = await res.json();
      if (data.success) {
        loadOrders();
      }
    } catch (e) {
      console.error("Mark printed error:", e);
    }
  }

  // Delete pending order
  async function handleDeleteOrder(barcode: string) {
    if (!window.confirm(`Supprimer la commande en attente ${barcode} chez Cosmos ?`)) return;
    try {
      const res = await fetch(`/api/cosmos/orders?barcode=${encodeURIComponent(barcode)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setMsg(data.message);
        loadOrders();
      } else {
        setErr(data.message || "Erreur suppression");
      }
    } catch {
      setErr("Erreur réseau");
    }
  }

  // Receive payment
  async function handleReceivePayment(paymentId: number) {
    if (!window.confirm("Confirmer la réception de ce règlement ?")) return;
    try {
      const res = await fetch("/api/cosmos/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg("Règlement validé comme reçu ✓");
        loadPayments();
      } else {
        setErr(data.message || "Erreur lors de la validation du règlement");
      }
    } catch {
      setErr("Erreur réseau");
    }
  }

  // Public track
  async function handlePublicTrack(e: FormEvent) {
    e.preventDefault();
    if (!trackSearch.trim()) return;
    setTrackLoading(true);
    setTrackResult(null);
    setTrackError("");

    try {
      const res = await fetch(`/api/cosmos/track?search=${encodeURIComponent(trackSearch.trim())}`);
      const data = await res.json();
      if (data.success && data.data) {
        setTrackResult(data.data);
      } else {
        setTrackError(data.message || "Aucune information trouvée.");
      }
    } catch {
      setTrackError("Erreur réseau");
    } finally {
      setTrackLoading(false);
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/shipping-providers"
            className="p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Cosmos Delivery</h1>
              {cfg?.configured ? (
                <span className="badge-status border text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  ● Configuré
                </span>
              ) : (
                <span className="badge-status border text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">
                  Non configuré
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Intégration API v1 (Commandes, Bordereaux, Règlements &amp; Suivi) — https://api.cosmos.tn/api/v1
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestConfig}
            disabled={busy || !cfg?.configured}
            className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 disabled:opacity-40"
          >
            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
            Tester connexion
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {err && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {err}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {msg}
        </div>
      )}

      {/* Configuration Card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-indigo-400" /> Authentification Bearer Token
          </h2>
          {cfg?.configured && (
            <span className="text-xs text-muted-foreground font-mono">
              Token actif : {cfg.maskedToken}
            </span>
          )}
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Token API Bearer Cosmos <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder={cfg?.configured ? "Laisser vide = conserver le token existant" : "eyJhbGciOiJIUzI1NiIsInR5cCI6Ik..."}
                  className="input-base pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Base URL API
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="input-base font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={busy}
                className="btn-primary text-xs py-2 px-4 flex items-center gap-2"
              >
                {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Enregistrer le token
              </button>
            </div>

            {cfg?.configured && (
              <button
                type="button"
                onClick={handleDeleteConfig}
                disabled={busy}
                className="text-xs text-destructive hover:underline flex items-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer configuration
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Main Tabs */}
      <div className="flex border-b border-border/60 gap-2 overflow-x-auto pb-1">
        {[
          { id: "import", label: "Importer Tracking", icon: Upload },
          { id: "create", label: "Créer une Commande", icon: PlusCircle },
          { id: "orders", label: "Bordereaux & Colis", icon: Printer },
          { id: "payments", label: "Règlements", icon: CreditCard },
          { id: "track", label: "Suivi Public", icon: Search },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap",
                activeTab === tab.id
                  ? "border-indigo-500 text-indigo-400 bg-indigo-500/10"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: IMPORT ──────────────────────────────────────────────── */}
      {activeTab === "import" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Upload className="h-4 w-4 text-indigo-400" /> Importer des codes barres Cosmos
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Collez vos identifiants ou codes-barres Cosmos (format standard 12 chiffres e.g. <span className="font-mono text-foreground font-semibold">000000000012</span> ou codes d&apos;intégration).
              </p>
            </div>

            <textarea
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"000000000012\n000000000013\nINT-ABC-789\n..."}
              className="input-base font-mono text-xs resize-y"
            />

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {parseTrackingCodes(importText).length} code(s) détecté(s)
              </span>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || parseTrackingCodes(importText).length === 0}
                className="btn-primary text-xs py-2 px-4 flex items-center gap-2 disabled:opacity-50"
              >
                {importing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {importing ? "Importation..." : "Importer depuis Cosmos API"}
              </button>
            </div>

            {importErr && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {importErr}
              </div>
            )}
            {importMsg && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400 flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 shrink-0" /> {importMsg}
              </div>
            )}

            {/* Results Display */}
            {importResult && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                    <span className="text-xl font-bold font-mono text-emerald-400">{importResult.imported}</span>
                    <p className="text-[11px] text-emerald-300">Créées</p>
                  </div>
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-center">
                    <span className="text-xl font-bold font-mono text-blue-400">{importResult.updated}</span>
                    <p className="text-[11px] text-blue-300">Mises à jour</p>
                  </div>
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-center">
                    <span className="text-xl font-bold font-mono text-rose-400">{importResult.failed}</span>
                    <p className="text-[11px] text-rose-300">Erreurs</p>
                  </div>
                </div>

                {importResult.details.length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden text-xs">
                    <div className="bg-muted/50 px-3 py-2 font-medium flex justify-between">
                      <span>Détail par colis ({importResult.details.length})</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y divide-border">
                      {importResult.details.map((d, i) => (
                        <div key={i} className="px-3 py-2 flex items-center justify-between font-mono">
                          <span className="font-semibold">{d.codeBar || d.tracking}</span>
                          {d.status === "SUCCESS" ? (
                            <span className="text-emerald-400">
                              ✓ {d.action === "created" ? "Créée" : "Mise à jour"} ({d.cosmosStatus || "OK"})
                            </span>
                          ) : (
                            <span className="text-rose-400">✗ {d.error}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: CREATE ORDER ────────────────────────────────────────── */}
      {activeTab === "create" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-indigo-400" /> Créer une expédition chez Cosmos Delivery
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Génère le colis et le code barre 12 chiffres directement via POST /orders.
            </p>
          </div>

          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Nom du destinataire <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Ex: John Doe"
                  className="input-base text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Téléphone principal <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="Ex: +216 12 345 678"
                  className="input-base text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Téléphone secondaire
                </label>
                <input
                  type="text"
                  value={createForm.phone2}
                  onChange={(e) => setCreateForm({ ...createForm, phone2: e.target.value })}
                  placeholder="Optionnel"
                  className="input-base text-xs"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Adresse de livraison <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.address}
                  onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                  placeholder="Ex: 123 Rue de la République"
                  className="input-base text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Gouvernorat / Ville (Enum Cosmos) <span className="text-destructive">*</span>
                </label>
                <select
                  value={createForm.city}
                  onChange={(e) => setCreateForm({ ...createForm, city: e.target.value as CosmosCity })}
                  className="input-base text-xs"
                >
                  {COSMOS_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Montant à encaisser (DT) <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={createForm.totalAmount}
                  onChange={(e) => setCreateForm({ ...createForm, totalAmount: e.target.value })}
                  placeholder="Ex: 150.50"
                  className="input-base text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Quantité d&apos;articles
                </label>
                <input
                  type="number"
                  min="1"
                  value={createForm.quantity}
                  onChange={(e) => setCreateForm({ ...createForm, quantity: e.target.value })}
                  className="input-base text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Nombre de colis (1 à 5)
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={createForm.packageCount}
                  onChange={(e) => setCreateForm({ ...createForm, packageCount: e.target.value })}
                  className="input-base text-xs"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Contenu du colis <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.content}
                  onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                  placeholder="Ex: Chaussures de sport"
                  className="input-base text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Code barre externe / Réf
                </label>
                <input
                  type="text"
                  value={createForm.externalBarcode}
                  onChange={(e) => setCreateForm({ ...createForm, externalBarcode: e.target.value })}
                  placeholder="Ex: EXT123456"
                  className="input-base text-xs font-mono"
                />
              </div>

              <div className="md:col-span-3">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Remarques / Instructions de livraison
                </label>
                <input
                  type="text"
                  value={createForm.note}
                  onChange={(e) => setCreateForm({ ...createForm, note: e.target.value })}
                  placeholder="Ex: Appeler avant livraison, manipuler avec soin"
                  className="input-base text-xs"
                />
              </div>
            </div>

            {/* Options */}
            <div className="flex flex-wrap gap-6 pt-2 border-t border-border/40">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.allowToOpen}
                  onChange={(e) => setCreateForm({ ...createForm, allowToOpen: e.target.checked })}
                  className="rounded border-input text-indigo-600 focus:ring-indigo-500"
                />
                Autoriser l&apos;ouverture du colis par le client
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.isFragile}
                  onChange={(e) => setCreateForm({ ...createForm, isFragile: e.target.checked })}
                  className="rounded border-input text-indigo-600 focus:ring-indigo-500"
                />
                Colis fragile
              </label>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.exchange}
                  onChange={(e) => setCreateForm({ ...createForm, exchange: e.target.checked })}
                  className="rounded border-input text-indigo-600 focus:ring-indigo-500"
                />
                Colis d&apos;échange
              </label>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="btn-primary text-xs py-2.5 px-6 flex items-center gap-2 disabled:opacity-50"
            >
              {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              {creating ? "Création en cours..." : "Créer le colis chez Cosmos"}
            </button>
          </form>

          {/* Success Banner */}
          {createSuccessData && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                  <span className="font-semibold text-emerald-400 text-sm">
                    Colis créé avec succès !
                  </span>
                </div>
                <span className="font-mono font-bold text-sm bg-background/80 px-2 py-1 rounded border border-border">
                  Barcode: {createSuccessData.barcode || createSuccessData.id}
                </span>
              </div>

              <div className="text-xs space-y-1 text-muted-foreground font-mono">
                <p>Destinataire : {createSuccessData.name} ({createSuccessData.phone})</p>
                <p>Montant : {createSuccessData.totalAmount} DT | Statut : {createSuccessData.status}</p>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {createSuccessData.labelUrl && (
                  <a
                    href={`/api/cosmos/labels?barcode=${encodeURIComponent(createSuccessData.barcode || createSuccessData.id)}&format=html`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <Printer className="h-3.5 w-3.5" /> Bordereau HTML
                  </a>
                )}
                {createSuccessData.labelPdfUrl && (
                  <a
                    href={`/api/cosmos/labels?barcode=${encodeURIComponent(createSuccessData.barcode || createSuccessData.id)}&format=pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5" /> Bordereau PDF
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: ORDERS & LABELS ─────────────────────────────────────── */}
      {activeTab === "orders" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Printer className="h-4 w-4 text-indigo-400" /> Commandes &amp; Bordereaux Cosmos
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Consultez les colis, générez les bordereaux et marquez les colis comme imprimés.
              </p>
            </div>

            <button
              onClick={() => loadOrders()}
              disabled={ordersLoading}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 self-start sm:self-auto"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", ordersLoading && "animate-spin")} />
              Actualiser
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filtrer par code-barres..."
                value={orderSearchBarcode}
                onChange={(e) => setOrderSearchBarcode(e.target.value)}
                className="input-base pl-8 text-xs font-mono"
              />
            </div>

            <select
              value={orderFilterPrinted}
              onChange={(e) => setOrderFilterPrinted(e.target.value)}
              className="input-base text-xs w-44"
            >
              <option value="all">Tous les bordereaux</option>
              <option value="not-printed">Non imprimés</option>
              <option value="printed">Déjà imprimés</option>
            </select>
          </div>

          {/* Orders Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5">Code Barre</th>
                    <th className="px-4 py-2.5">Statut</th>
                    <th className="px-4 py-2.5">Paiement</th>
                    <th className="px-4 py-2.5">Contenu / Qté</th>
                    <th className="px-4 py-2.5">Imprimé</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-semibold">
                        {o.barcode || o.id}
                        {o.integrationBarcode && (
                          <span className="block text-[10px] text-muted-foreground font-normal">
                            Int: {o.integrationBarcode}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary border border-primary/20">
                          {cosmosStatusLabel(o.status)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px]",
                            o.paymentStatus === "paid"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-amber-500/10 text-amber-400"
                          )}
                        >
                          {o.paymentStatus || "unpaid"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-sans">
                        <span className="text-foreground">{o.content || "—"}</span>
                        <span className="text-muted-foreground ml-1">({o.quantity || 1})</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {o.printed ? (
                          <span className="text-emerald-400 font-sans text-[11px] flex items-center gap-1">
                            <Check className="h-3 w-3" /> Imprimé
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-sans text-[11px]">En attente</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`/api/cosmos/labels?barcode=${encodeURIComponent(o.barcode || o.id)}&format=html`}
                            target="_blank"
                            rel="noreferrer"
                            title="Ouvrir le bordereau HTML"
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Printer className="h-4 w-4" />
                          </a>

                          <a
                            href={`/api/cosmos/labels?barcode=${encodeURIComponent(o.barcode || o.id)}&format=pdf`}
                            target="_blank"
                            rel="noreferrer"
                            title="Télécharger le bordereau PDF"
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <FileText className="h-4 w-4" />
                          </a>

                          <button
                            type="button"
                            onClick={() => handleMarkPrinted(o.barcode || o.id, !o.printed)}
                            title={o.printed ? "Marquer comme non imprimé" : "Marquer comme imprimé"}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>

                          {o.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(o.barcode || o.id)}
                              title="Supprimer la commande en attente"
                              className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground font-sans">
                        {ordersLoading ? "Chargement des commandes..." : "Aucune commande trouvée chez Cosmos."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: PAYMENTS ────────────────────────────────────────────── */}
      {activeTab === "payments" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-indigo-400" /> Règlements &amp; Versements Cosmos Delivery
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Historique des paiements encaissés, frais de livraison déduits et virements reçus.
              </p>
            </div>
            <button
              onClick={() => loadPayments()}
              disabled={paymentsLoading}
              className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", paymentsLoading && "animate-spin")} />
              Actualiser
            </button>
          </div>

          <div className="space-y-3">
            {payments.map((p) => (
              <div key={p.id} className="rounded-lg border border-border p-4 bg-muted/20 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/40 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm">Règlement #{p.id}</span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-semibold uppercase",
                        p.status === "closed"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      )}
                    >
                      {p.status}
                    </span>
                    {p.receivedAt && (
                      <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                        <Check className="h-3 w-3" /> Reçu le {new Date(p.receivedAt).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </div>

                  {p.status === "closed" && !p.receivedAt && (
                    <button
                      type="button"
                      onClick={() => handleReceivePayment(p.id)}
                      className="btn-primary text-xs py-1 px-3 self-start sm:self-auto"
                    >
                      Confirmer réception
                    </button>
                  )}
                </div>

                {p.metadata && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="p-2.5 rounded bg-background border border-border">
                      <span className="text-[10px] text-muted-foreground block font-sans">Montant Net Payé</span>
                      <span className="text-base font-bold text-emerald-400">{p.metadata.shipperPayment} DT</span>
                    </div>
                    <div className="p-2.5 rounded bg-background border border-border">
                      <span className="text-[10px] text-muted-foreground block font-sans">Frais de livraison</span>
                      <span className="text-base font-bold text-rose-400">{p.metadata.totalDeliveryFees} DT</span>
                    </div>
                    <div className="p-2.5 rounded bg-background border border-border">
                      <span className="text-[10px] text-muted-foreground block font-sans">Colis livrés</span>
                      <span className="text-base font-bold">{p.metadata.deliveredOrdersCount || 0}</span>
                    </div>
                    <div className="p-2.5 rounded bg-background border border-border">
                      <span className="text-[10px] text-muted-foreground block font-sans">Colis retournés</span>
                      <span className="text-base font-bold">{p.metadata.returnedOrdersCount || 0}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {payments.length === 0 && (
              <p className="text-center py-8 text-xs text-muted-foreground">
                {paymentsLoading ? "Chargement des règlements..." : "Aucun règlement disponible."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 5: PUBLIC TRACK ────────────────────────────────────────── */}
      {activeTab === "track" && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Search className="h-4 w-4 text-indigo-400" /> Suivi Public de Colis Cosmos (GET /track)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Endpoint public sans authentification — peut être partagé directement aux clients ou intégré sur une vitrine.
            </p>
          </div>

          <form onSubmit={handlePublicTrack} className="flex gap-2">
            <input
              type="text"
              required
              placeholder="Code barre (ex: 000000000012) ou numéro de téléphone client"
              value={trackSearch}
              onChange={(e) => setTrackSearch(e.target.value)}
              className="input-base text-xs font-mono flex-1"
            />
            <button
              type="submit"
              disabled={trackLoading}
              className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
            >
              {trackLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Rechercher
            </button>
          </form>

          {trackError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {trackError}
            </div>
          )}

          {trackResult && (
            <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-border/40 pb-2 font-sans">
                <span className="font-semibold text-sm">Colis #{trackResult.order?.id}</span>
                <span className="px-2 py-0.5 rounded text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  {cosmosStatusLabel(trackResult.order?.status)}
                </span>
              </div>

              {Array.isArray(trackResult.history) && trackResult.history.length > 0 && (
                <div className="space-y-2 pt-1 font-sans">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                    Historique des étapes ({trackResult.history.length})
                  </span>
                  <div className="space-y-2 border-l-2 border-indigo-500/40 pl-3">
                    {trackResult.history.map((h: any, i: number) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium text-foreground">
                          {cosmosStatusLabel(h.newValue || h.action)}
                        </span>
                        <span className="block text-[11px] text-muted-foreground font-mono">
                          {new Date(h.timestamp).toLocaleString("fr-FR")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
