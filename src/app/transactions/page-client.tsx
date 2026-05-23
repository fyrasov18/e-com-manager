"use client";

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw, CheckCircle, Clock, Truck, AlertTriangle,
  Package, XCircle, FileText, X, AlertCircle, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DeliveryRevenue = {
  totalRevenue: number;
  totalShipments: number;
  delivered: number;
  pending: number;
  cancelled: number;
  returned: number;
  totalReceived: number;
  totalValidated: number;
  configured: boolean;
  hasInstaDelivery: boolean;
  hasColissimo: boolean;
  error: string | null;
};

type RevenueRow = {
  id: string;
  provider: string;
  trackingNumber: string | null;
  reference: string | null;
  customerName: string | null;
  amount: number;
  paymentStatus: string;
  isValidated: boolean;
  importedAt: string;
  paymentNumber: string | null;
  confidenceScore: number | null;
  source: string;
};

type ExtractedPayment = {
  provider: string;
  documentType: string;
  isPaymentReceipt: boolean;
  paymentNumber: string | null;
  paymentDate: string | null;
  trackingNumber: string | null;
  reference: string | null;
  internalImportId: string;
  customerName: string | null;
  amount: number | null;
  deliveryFee: number | null;
  returnFee: number | null;
  netAmount: number | null;
  paymentStatus: string;
  confidence: number;
  extractionSource: "LOCAL" | "GOOGLE_AI" | "MANUAL";
  rawText: string;
  blockReason?: string;
  import?: boolean;
  manualAmount?: number | null;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  PAYMENT_RECEIPT: "✓ Reçu de paiement",
  DELIVERY_SLIP: "✗ Bordereau de livraison",
  MANIFEST: "✗ Manifeste",
  UNKNOWN: "? Document inconnu",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  RECEIVED: { label: "Reçu", color: "text-emerald-400 bg-emerald-500/15" },
  PENDING: { label: "En attente", color: "text-amber-400 bg-amber-500/15" },
  VALIDATED: { label: "Validé", color: "text-blue-400 bg-blue-500/15" },
  REJECTED: { label: "Rejeté", color: "text-rose-400 bg-rose-500/15" },
};

export default function RevenueLivraisonPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState<DeliveryRevenue | null>(null);
  const [revenues, setRevenues] = useState<RevenueRow[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // PDF modal
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfProvider, setPdfProvider] = useState("COLISSIMO");
  const [analyzingPdf, setAnalyzingPdf] = useState(false);
  const [extractedPayments, setExtractedPayments] = useState<ExtractedPayment[]>([]);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [pdfDocumentType, setPdfDocumentType] = useState<string | null>(null);
  const [pdfBlockReason, setPdfBlockReason] = useState<string | null>(null);

  // Debug panel state
  const [debugInfo, setDebugInfo] = useState<{
    route: string; status: number | null; response: any; sent: number; created: number; error: string | null;
  } | null>(null);

  const loadData = useCallback(async () => {
    setRevenueLoading(true);
    try {
      const res = await fetch("/api/delivery-revenue");
      const data = await res.json();
      setConfigured(data.configured ?? false);
      setStats(data.revenue ?? null);
      setRevenues(data.revenues ?? []);
      if (data.revenue?.error) setMessage(data.revenue.error);
    } catch {
      setError("Erreur chargement données.");
    } finally {
      setRevenueLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function syncAll() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/revenue-livraison/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Sync échouée."); return; }
      setMessage("Synchronisation terminée.");
      await loadData();
    } catch { setError("Erreur sync."); }
    finally { setLoading(false); }
  }

  async function validateRevenue(id: string) {
    const res = await fetch("/api/delivery-revenue/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) { setMessage("Paiement validé."); await loadData(); }
    else setError(data.error || "Erreur validation.");
  }

  async function resyncRevenue(id: string) {
    const res = await fetch("/api/delivery-revenue/resync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.success) { setMessage(data.message || "Resynchronisé."); await loadData(); }
    else setError(data.message || "Erreur resync.");
  }

  async function deleteRevenue(id: string) {
    if (!confirm("Supprimer ce revenu ?")) return;
    const res = await fetch(`/api/delivery-revenue?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) { setMessage("Supprimé."); await loadData(); }
    else setError(data.message || "Erreur suppression.");
  }

  async function handlePdfUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAnalyzingPdf(true);
    setError("");
    setMessage("");
    setPdfBlockReason(null);
    setPdfDocumentType(null);
    setExtractedPayments([]);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("provider", pdfProvider);

    try {
      const res = await fetch("/api/delivery-revenue/import-pdf", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) { setError(data.error || "Erreur analyse PDF."); return; }

      setPdfDocumentType(data.documentType || null);

      if (data.blocked) {
        setPdfBlockReason(data.blockReason || "Document non valide.");
        return;
      }

      const payments = (data.payments || []).map((p: ExtractedPayment) => ({
        ...p,
        import: p.amount !== null && p.amount > 0,
        manualAmount: p.amount,
      }));
      setExtractedPayments(payments);

      if (payments.length === 0) {
        setPdfBlockReason("Aucun paiement détecté.");
      }
    } catch { setError("Erreur upload PDF."); }
    finally { setAnalyzingPdf(false); }
  }

  async function confirmPdfImport() {
    const toImport = extractedPayments
      .filter((p) => p.import)
      .map((p) => ({ ...p, amount: p.manualAmount ?? p.amount }));

    console.log("[PDF Import] selected payments", toImport);
    console.log("[PDF Import] selectedPayments count:", toImport.length);

    if (toImport.length === 0) {
      setError("Aucun paiement sélectionné.");
      return;
    }

    const invalid = toImport.filter((p) => !p.amount || (p.amount as number) <= 0);
    if (invalid.length > 0) {
      setError(`Certains montants sont invalides (${invalid.length} paiement(s)). Corrigez avant import.`);
      return;
    }

    const body = { payments: toImport, source: "PDF_IMPORT", provider: pdfProvider };
    console.log("[PDF Import] sending body", JSON.stringify(body, null, 2));

    setConfirmingImport(true);
    setError("");
    setDebugInfo(null);

    try {
      const res = await fetch("/api/delivery-revenue/confirm-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let data: any = {};
      try { data = await res.json(); } catch { data = { error: "Réponse non-JSON" }; }

      console.log("[PDF Import] response status:", res.status);
      console.log("[PDF Import] response data:", data);

      // Mettre à jour le panel debug
      setDebugInfo({
        route: "/api/delivery-revenue/confirm-import",
        status: res.status,
        response: data,
        sent: toImport.length,
        created: data.imported ?? 0,
        error: data.error || (data.errors?.length > 0 ? data.errors[0] : null),
      });

      if (!res.ok || data.error) {
        const errMsg = data.error || data.message || `Erreur HTTP ${res.status}`;
        console.error("[PDF Import] Import failed:", errMsg);
        setError(errMsg);
        return;
      }

      if (data.errors?.length > 0) {
        setError(`${data.errors.length} erreur(s): ${data.errors[0]}`);
      }

      if (data.imported > 0) {
        setMessage(`✓ ${data.imported} paiement(s) importé(s) avec succès.`);
        setShowPdfModal(false);
        setExtractedPayments([]);
        setPdfBlockReason(null);
        setDebugInfo(null);
        await loadData();
      } else {
        const errMsg = data.message || data.errors?.[0] || "Aucun paiement importé — vérifiez les logs serveur.";
        console.error("[PDF Import] 0 imported:", errMsg);
        setError(errMsg);
      }
    } catch (e) {
      console.error("[PDF Import] fetch error:", e);
      setError("Erreur réseau lors de la confirmation.");
    } finally {
      setConfirmingImport(false);
    }
  }

  function closePdfModal() {
    setShowPdfModal(false);
    setExtractedPayments([]);
    setPdfBlockReason(null);
    setPdfDocumentType(null);
  }

  function updateManualAmount(index: number, value: string) {
    const parsed = parseFloat(value.replace(",", "."));
    setExtractedPayments((prev) =>
      prev.map((p, i) =>
        i === index
          ? { ...p, manualAmount: isNaN(parsed) ? null : parsed, extractionSource: "MANUAL", import: !isNaN(parsed) && parsed > 0 }
          : p
      )
    );
  }

  const selectedPayments = extractedPayments.filter((p) => p.import);
  const canImport = selectedPayments.length > 0 &&
    selectedPayments.every((p) => { const a = p.manualAmount ?? p.amount; return a !== null && a > 0; }) &&
    !pdfBlockReason;

  const filteredRevenues = revenues.filter((r) =>
    filterStatus === "ALL" || r.paymentStatus === filterStatus
  );

  const confidenceBadge = (c: number) =>
    c >= 0.75 ? "bg-emerald-500/20 text-emerald-400" :
    c >= 0.5 ? "bg-amber-500/20 text-amber-400" :
    "bg-rose-500/20 text-rose-400";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Revenue Livraison</h1>
          <p className="text-muted-foreground mt-1 text-sm">Paiements reçus depuis les sociétés de livraison.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowPdfModal(true)}
            className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-secondary font-medium hover:bg-secondary/80 transition-colors">
            <FileText className="h-4 w-4" /> Importer PDF
          </button>
          <button onClick={syncAll} disabled={loading}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {loading ? "Sync..." : "Synchroniser"}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5"/>{error}</div>}
      {message && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{message}</div>}

      {/* Not configured */}
      {!configured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-500">Aucune intégration configurée</h3>
              <p className="text-sm text-muted-foreground mt-1">Configurez InstaDelivery ou Colissimo dans les paramètres.</p>
              <a href="/settings" className="text-sm text-amber-500 hover:underline mt-2 inline-block">Aller aux paramètres →</a>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { icon: <Truck className="h-4 w-4 text-emerald-500"/>, label: "Revenu validé", value: `${(stats.totalRevenue || 0).toFixed(2)} TND`, color: "text-emerald-500" },
            { icon: <Package className="h-4 w-4"/>, label: "Total", value: revenues.length },
            { icon: <CheckCircle className="h-4 w-4 text-emerald-500"/>, label: "Reçus", value: revenues.filter(r => r.paymentStatus === "RECEIVED").length, color: "text-emerald-500" },
            { icon: <Clock className="h-4 w-4 text-amber-500"/>, label: "En attente", value: revenues.filter(r => r.paymentStatus === "PENDING").length, color: "text-amber-500" },
            { icon: <CheckCircle className="h-4 w-4 text-blue-500"/>, label: "Validés", value: revenues.filter(r => r.isValidated).length, color: "text-blue-500" },
            { icon: <XCircle className="h-4 w-4 text-rose-500"/>, label: "Annulés", value: revenues.filter(r => r.paymentStatus === "REJECTED").length, color: "text-rose-500" },
          ].map((card, i) => (
            <div key={i} className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 mb-1.5">{card.icon}<p className="text-xs text-muted-foreground">{card.label}</p></div>
              <p className={cn("text-xl font-bold font-mono", card.color)}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Revenue table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Table filter */}
        <div className="flex items-center gap-2 p-4 border-b border-border flex-wrap">
          <span className="text-sm text-muted-foreground mr-1">Filtrer:</span>
          {["ALL", "RECEIVED", "PENDING", "VALIDATED"].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn("text-xs px-2.5 py-1 rounded-full transition-colors",
                filterStatus === s ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80 text-muted-foreground"
              )}>
              {s === "ALL" ? "Tous" : STATUS_LABELS[s]?.label || s}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">{filteredRevenues.length} entrée(s)</span>
        </div>

        {revenueLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Chargement...</div>
        ) : filteredRevenues.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {revenues.length === 0 ? "Aucun paiement enregistré. Importez un PDF ou synchronisez." : "Aucun résultat pour ce filtre."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {["Provider", "Tracking", "Référence", "Client", "Montant", "Statut", "Source", "Date", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredRevenues.map((r) => {
                  const status = STATUS_LABELS[r.paymentStatus] ?? { label: r.paymentStatus, color: "text-muted-foreground bg-muted" };
                  return (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium">{r.provider}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.trackingNumber || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.reference || "—"}</td>
                      <td className="px-4 py-3 text-xs">{r.customerName || "—"}</td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-400">{r.amount.toFixed(3)} TND</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", status.color)}>
                          {status.label}
                        </span>
                        {!r.isValidated && r.paymentStatus === "RECEIVED" && (
                          <span className="ml-1 text-xs text-muted-foreground">(non validé)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.source}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(r.importedAt).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {!r.isValidated && r.paymentStatus !== "VALIDATED" && (
                            <button onClick={() => validateRevenue(r.id)} title="Valider"
                              className="p-1.5 rounded-md hover:bg-emerald-500/20 text-emerald-400 transition-colors">
                              <CheckCircle className="h-3.5 w-3.5"/>
                            </button>
                          )}
                          <button onClick={() => resyncRevenue(r.id)} title="Resynchroniser"
                            className="p-1.5 rounded-md hover:bg-blue-500/20 text-blue-400 transition-colors">
                            <RotateCcw className="h-3.5 w-3.5"/>
                          </button>
                          <button onClick={() => deleteRevenue(r.id)} title="Supprimer"
                            className="p-1.5 rounded-md hover:bg-rose-500/20 text-rose-400 transition-colors">
                            <X className="h-3.5 w-3.5"/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PDF Import Modal */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
              <h2 className="text-lg font-semibold">Importer reçu PDF</h2>
              <button onClick={closePdfModal} className="p-1 hover:bg-accent rounded-md transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium mb-1.5">Société de livraison</label>
                <select value={pdfProvider} onChange={(e) => setPdfProvider(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="COLISSIMO">Colissimo</option>
                  <option value="INSTADELIVERY">InstaDelivery</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Fichier PDF</label>
                <input type="file" accept="application/pdf" onChange={handlePdfUpload}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:text-primary-foreground" />
              </div>

              {analyzingPdf && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Analyse en cours...
                </div>
              )}

              {pdfDocumentType && !analyzingPdf && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Type détecté:</span>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                    pdfDocumentType === "PAYMENT_RECEIPT" ? "bg-emerald-500/20 text-emerald-400" :
                    pdfDocumentType === "DELIVERY_SLIP" ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
                  )}>{DOC_TYPE_LABELS[pdfDocumentType] || pdfDocumentType}</span>
                </div>
              )}

              {pdfBlockReason && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-300">{pdfBlockReason}</p>
                </div>
              )}

              {extractedPayments.length > 0 && !analyzingPdf && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">{extractedPayments.length} paiement(s) détecté(s)</p>
                  {extractedPayments.map((p, i) => {
                    const effectiveAmount = p.manualAmount ?? p.amount;
                    const amountMissing = effectiveAmount === null || effectiveAmount <= 0;
                    return (
                      <div key={i} className={cn("rounded-lg border p-3 space-y-2",
                        p.import ? "border-primary/40 bg-primary/5" : "border-border bg-card/50")}>
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={!!p.import}
                              onChange={() => setExtractedPayments((prev) => prev.map((x, j) => j === i ? { ...x, import: !x.import } : x))}
                              className="h-4 w-4 accent-primary" />
                            <span className="text-sm font-medium">{p.provider}</span>
                          </label>
                          <span className={cn("text-xs px-1.5 py-0.5 rounded", confidenceBadge(p.confidence))}>
                            {Math.round(p.confidence * 100)}% — {p.extractionSource}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Tracking: <span className="text-foreground font-mono">{p.trackingNumber || "—"}</span></span>
                          <span>Réf: <span className="text-foreground">{p.reference || "Non détectée"}</span></span>
                          <span>Client: <span className="text-foreground">{p.customerName || "—"}</span></span>
                          <span>N° paiement: <span className="text-foreground">{p.paymentNumber || "—"}</span></span>
                        </div>
                        {amountMissing ? (
                          <div className="space-y-1">
                            <p className="text-xs text-rose-400 font-medium">⚠ Montant non détecté — saisie obligatoire</p>
                            <div className="flex items-center gap-2">
                              <input type="number" min="0" step="0.001" placeholder="Ex: 120.000"
                                onChange={(e) => updateManualAmount(i, e.target.value)}
                                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm" />
                              <span className="text-xs text-muted-foreground">TND</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm font-mono font-bold text-emerald-400">
                            {(effectiveAmount ?? 0).toFixed(3)} TND
                            {p.extractionSource === "MANUAL" && <span className="ml-1 text-xs text-amber-400">(corrigé)</span>}
                          </p>
                        )}
                        {p.confidence < 0.5 && (
                          <p className="text-xs text-amber-400">⚠ Données incertaines — vérifiez avant import.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Debug panel — visible seulement si debugInfo existe */}
            {debugInfo && (
              <div className="mx-5 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs font-mono space-y-1">
                <p className="text-amber-400 font-semibold">🔍 Debug dernier import</p>
                <p>Route: {debugInfo.route}</p>
                <p>Status HTTP: <span className={debugInfo.status === 200 ? "text-emerald-400" : "text-rose-400"}>{debugInfo.status}</span></p>
                <p>Envoyés: {debugInfo.sent} | Créés: <span className={debugInfo.created > 0 ? "text-emerald-400" : "text-rose-400"}>{debugInfo.created}</span></p>
                {debugInfo.error && <p className="text-rose-400">Erreur: {debugInfo.error}</p>}
                <details>
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Réponse JSON complète</summary>
                  <pre className="mt-1 text-muted-foreground overflow-auto max-h-32">{JSON.stringify(debugInfo.response, null, 2)}</pre>
                </details>
              </div>
            )}
            <div className="flex items-center justify-between p-5 border-t border-border gap-3 shrink-0">
              <button onClick={closePdfModal} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors">
                Annuler
              </button>
              <button onClick={confirmPdfImport} disabled={!canImport || confirmingImport}
                className="px-5 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
                {confirmingImport ? "Importation..." : `Importer (${selectedPayments.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}