"use client";

import { FormEvent, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Truck, Send, CheckCircle, AlertCircle, TestTube, Trash2,
  X, Eye, EyeOff, RefreshCw, Wifi, WifiOff, Upload,
  Download, Package, CreditCard, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseTrackingCodes } from "@/lib/tracking-utils";

const COLISSIMO_BASE_URL = "https://delivery.colissimo.com.tn/api";

type ColissimoStatus = {
  configured: boolean;
  config?: {
    utilisateur: string;
    isActive: boolean;
    lastTested?: string | null;
    lastError?: string | null;
  };
};

type ImportResult = {
  imported: number; updated: number; failed: number; paymentsReceived: number;
  details: { codeBar: string; status: string; action?: string; paymentStatus?: string; error?: string }[];
};

type DBStats = { ordersInDB: number; revenuesInDB: number };

export default function ShippingProvidersPage() {
  const [colStatus, setColStatus] = useState<ColissimoStatus>({ configured: false });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [dbStats, setDbStats] = useState<DBStats>({ ordersInDB: 0, revenuesInDB: 0 });

  // Config form
  const [uilisateur, setUilisateur] = useState("");
  const [pass, setPass] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Import state
  const [codeBarInput, setCodeBarInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Feedback
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const [configRes, statsRes] = await Promise.all([
        fetch("/api/colissimo"),
        fetch("/api/colissimo/bulk-import"),
      ]);
      const configData = await configRes.json();
      const statsData = await statsRes.json();
      setColStatus(configData);
      if (configData.configured && configData.config) setUilisateur(configData.config.utilisateur || "");
      setDbStats({ ordersInDB: statsData.ordersInDB ?? 0, revenuesInDB: statsData.revenuesInDB ?? 0 });
    } catch {
      setError("Impossible de charger la configuration.");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const clearMessages = () => { setMessage(""); setError(""); setTestResult(null); };

  // ── Save config ──────────────────────────────────────────────────────
  async function handleSave(e: FormEvent) {
    e.preventDefault();
    clearMessages();
    if (!uilisateur.trim()) { setError("L'utilisateur est requis."); return; }
    if (!pass.trim() && !colStatus.configured) { setError("Le mot de passe est requis."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/colissimo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", utilisateur: uilisateur.trim(), motPasse: pass.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) setError(data.message || "Erreur enregistrement.");
      else { setMessage("Configuration enregistrée ✓"); setPass(""); await loadData(); }
    } catch { setError("Erreur réseau."); }
    setSaving(false);
  }

  // ── Test connection ──────────────────────────────────────────────────
  async function handleTest() {
    clearMessages();
    setTesting(true);
    try {
      const res = await fetch("/api/colissimo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const data = await res.json();
      const msg: string = data.message || data.error || "";
      if (msg.toLowerCase().includes("html") || msg.toLowerCase().includes("login page")) {
        setTestResult({ success: false, message: "Colissimo retourne une page HTML — vérifiez Base URL, méthode POST, Utilisateur et Pass." });
      } else {
        setTestResult({ success: data.success, message: msg || (data.success ? "Connexion OK ✓" : "Connexion échouée") });
      }
    } catch { setTestResult({ success: false, message: "Erreur réseau." }); }
    setTesting(false);
  }

  // ── Delete config ────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true); clearMessages();
    try {
      const res = await fetch("/api/colissimo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      const data = await res.json();
      if (data.success) { setMessage("Configuration supprimée."); setUilisateur(""); setPass(""); setConfirmDelete(false); await loadData(); }
      else setError(data.message || "Erreur suppression.");
    } catch { setError("Erreur réseau."); }
    setDeleting(false);
  }

  // ── Bulk import ──────────────────────────────────────────────────────
  async function handleBulkImport(mode: "codebars" | "resync") {
    clearMessages(); setImportResult(null); setImporting(true);
    setImportProgress(mode === "resync" ? "Resynchronisation en cours..." : "Import en cours...");

    try {
      const codeBars = mode === "codebars"
        ? parseTrackingCodes(codeBarInput)
        : [];

      if (mode === "codebars" && codeBars.length === 0) {
        setError("Entrez au moins un code barre.");
        setImporting(false);
        return;
      }

      setImportProgress(mode === "resync"
        ? `Resynchronisation de ${dbStats.ordersInDB} colis existants...`
        : `Import de ${codeBars.length} colis en lots de 50...`);

      const res = await fetch("/api/colissimo/bulk-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, codeBars }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Erreur import.");
      } else {
        setMessage(`✓ ${data.message}`);
        setImportResult(data.results);
        await loadData();
        if (mode === "codebars") setCodeBarInput("");
      }
    } catch { setError("Erreur réseau lors de l'import."); }
    setImportProgress("");
    setImporting(false);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Sociétés de livraison</h1>
        <p className="text-muted-foreground mt-1 text-sm">Intégration et import des commandes Colissimo TN.</p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0" />{message}
        </div>
      )}
      {testResult && (
        <div className={cn("rounded-lg border px-4 py-3 text-sm flex items-start gap-2",
          testResult.success ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-destructive/30 bg-destructive/10 text-destructive")}>
          {testResult.success ? <Wifi className="h-4 w-4 shrink-0 mt-0.5" /> : <WifiOff className="h-4 w-4 shrink-0 mt-0.5" />}
          {testResult.message}
        </div>
      )}

      {/* ── DB Stats ── */}
      {(dbStats.ordersInDB > 0 || dbStats.revenuesInDB > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-blue-400" /><span className="text-xs text-muted-foreground">Commandes Colissimo</span></div>
            <p className="text-2xl font-bold font-mono text-blue-400">{dbStats.ordersInDB}</p>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-1"><CreditCard className="h-4 w-4 text-emerald-400" /><span className="text-xs text-muted-foreground">Paiements enregistrés</span></div>
            <p className="text-2xl font-bold font-mono text-emerald-400">{dbStats.revenuesInDB}</p>
          </div>
        </div>
      )}

      {/* ── Colissimo config form ── */}
      <div className="rounded-xl border border-border bg-card p-5 lg:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Truck className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-semibold">Colissimo TN</h2>
              <p className="text-xs text-muted-foreground">Authentification : Utilisateur + Pass</p>
            </div>
          </div>
          {colStatus.configured && (
            <span className="badge-status border text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">● Configuré</span>
          )}
        </div>

        {colStatus.configured && colStatus.config && (
          <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 space-y-1 text-xs text-muted-foreground">
            <p>Utilisateur : <span className="text-foreground font-mono">{colStatus.config.utilisateur}</span></p>
            {colStatus.config.lastError && <p className="text-destructive">Dernière erreur : {colStatus.config.lastError}</p>}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Base URL API</label>
            <input value={COLISSIMO_BASE_URL} readOnly className="input-base font-mono text-xs opacity-60 cursor-not-allowed" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Utilisateur <span className="text-destructive">*</span></label>
              <input value={uilisateur} onChange={e => setUilisateur(e.target.value)} placeholder="Identifiant Colissimo" className="input-base" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Pass <span className="text-destructive">*</span></label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)}
                  placeholder={colStatus.configured ? "Laisser vide = inchangé" : "Mot de passe"} className="input-base pr-10"
                  required={!colStatus.configured} />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button disabled={saving} className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><RefreshCw className="h-4 w-4 animate-spin" /> Enregistrement...</> : "Enregistrer"}
            </button>
            <button type="button" onClick={handleTest} disabled={testing || !colStatus.configured}
              className="btn-secondary flex items-center gap-2 disabled:opacity-40">
              {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
              Tester
            </button>
          </div>
        </form>

        {colStatus.configured && (
          <div className="pt-2 border-t border-border">
            {confirmDelete ? (
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={deleting}
                  className="btn-danger flex items-center gap-2 flex-1 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />{deleting ? "Suppression..." : "Confirmer"}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary flex items-center gap-2">
                  <X className="h-4 w-4" /> Annuler
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="btn-danger flex items-center gap-2 text-sm">
                <Trash2 className="h-4 w-4" /> Supprimer la configuration
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Bulk Import section ── */}
      {colStatus.configured && (
        <div className="rounded-xl border border-border bg-card p-5 lg:p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Import des commandes Colissimo</h2>
              <p className="text-xs text-muted-foreground">Importer ou resynchroniser les commandes + paiements depuis l&apos;API Colissimo</p>
            </div>
          </div>

          {/* Resync existing */}
          {dbStats.ordersInDB > 0 && (
            <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-3">
              <div>
                <p className="text-sm font-medium text-blue-300">Resynchroniser les {dbStats.ordersInDB} commandes existantes</p>
                <p className="text-xs text-muted-foreground mt-0.5">Recharge les statuts, montants et paiements depuis Colissimo pour tous les colis déjà en base.</p>
              </div>
              <button onClick={() => handleBulkImport("resync")} disabled={importing}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {importing ? <><RefreshCw className="h-4 w-4 animate-spin" />{importProgress || "En cours..."}</> : <><RotateCcw className="h-4 w-4" />Resync {dbStats.ordersInDB} commandes + paiements</>}
              </button>
            </div>
          )}

          {/* Import by codeBars */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Codes barres à importer <span className="text-muted-foreground">(un par ligne, ou séparés par virgule)</span>
              </label>
              <textarea
                value={codeBarInput}
                onChange={e => setCodeBarInput(e.target.value)}
                rows={6}
                placeholder={"COLTN2025001\nCOLTN2025002\nCOLTN2025003\n..."}
                className="input-base font-mono text-xs resize-y"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {parseTrackingCodes(codeBarInput).length} codes barres détectés
              </p>
            </div>
            <button onClick={() => handleBulkImport("codebars")} disabled={importing || !codeBarInput.trim()}
              className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {importing
                ? <><RefreshCw className="h-4 w-4 animate-spin" />{importProgress || "Import en cours..."}</>
                : <><Upload className="h-4 w-4" />Importer les commandes + paiements</>}
            </button>
          </div>

          {/* Import results */}
          {importResult && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  { label: "Importées", val: importResult.imported, cls: "text-emerald-400" },
                  { label: "Mises à jour", val: importResult.updated, cls: "text-blue-400" },
                  { label: "Paiements reçus", val: importResult.paymentsReceived, cls: "text-primary" },
                  { label: "Erreurs", val: importResult.failed, cls: "text-destructive" },
                ].map((s, i) => (
                  <div key={i} className="p-2 rounded-lg bg-card border border-border">
                    <p className={cn("text-xl font-bold font-mono", s.cls)}>{s.val}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowDetails(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showDetails ? "Masquer" : "Voir"} le détail ({importResult.details.length} colis)
              </button>
              {showDetails && (
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {importResult.details.map((d, i) => (
                    <div key={i} className={cn("flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono",
                      d.error ? "bg-destructive/10 text-destructive" : "bg-muted/40 text-foreground")}>
                      <span>{d.codeBar}</span>
                      <div className="flex gap-2">
                        <span className="text-muted-foreground">{d.status}</span>
                        {d.action && <span className={d.action === "imported" ? "text-emerald-400" : "text-blue-400"}>{d.action}</span>}
                        {d.paymentStatus === "RECEIVED" && <span className="text-primary">💳 reçu</span>}
                        {d.error && <span className="text-destructive">{d.error}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── InstaDelivery card ── */}
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5 lg:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
              <Truck className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">InstaDelivery</h2>
              <p className="text-sm text-muted-foreground">API de livraison en Tunisie.</p>
            </div>
          </div>
          <Link href="/shipping-providers/insta-delivery"
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 text-white px-4 py-2.5 font-medium hover:bg-orange-700 transition-colors">
            <Send className="h-4 w-4" /> Configurer
          </Link>
        </div>
      </div>
    </div>
  );
}
