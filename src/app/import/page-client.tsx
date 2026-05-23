"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Upload, FileSpreadsheet, ArrowRight, Check, X, RefreshCw,
  Package, Truck, AlertCircle, CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseTrackingCodes } from "@/lib/tracking-utils";

/* ───────────── Types Excel ───────────── */
type ExcelRow = Record<string, unknown>;
type ColumnMapping = { excelColumn: string; targetField: string };
type ImportTarget = "products" | "orders" | "expenses" | "all";

const TARGET_FIELDS: Record<ImportTarget, { label: string; fields: Record<string, { label: string; required: boolean; type: string }> }> = {
  products: {
    label: "Produits",
    fields: {
      name:        { label: "Nom du produit",    required: true,  type: "string" },
      stock:       { label: "Quantité en stock",  required: false, type: "number" },
      costPrice:   { label: "Prix d'achat",       required: false, type: "number" },
      salePrice:   { label: "Prix de vente",      required: false, type: "number" },
      sku:         { label: "SKU",                required: false, type: "string" },
      description: { label: "Description",        required: false, type: "string" },
    },
  },
  orders: {
    label: "Commandes",
    fields: {
      customerName:    { label: "Nom client",     required: true,  type: "string" },
      customerPhone:   { label: "Téléphone",      required: true,  type: "string" },
      shippingAddress: { label: "Adresse",        required: false, type: "string" },
      revenue:         { label: "Montant",        required: true,  type: "number" },
      status:          { label: "Statut",         required: false, type: "string" },
      trackingNumber:  { label: "Numéro suivi",   required: false, type: "string" },
      date:            { label: "Date",           required: false, type: "date" },
    },
  },
  expenses: {
    label: "Dépenses",
    fields: {
      name:      { label: "Nom",        required: true,  type: "string" },
      amount:    { label: "Montant",    required: true,  type: "number" },
      type:      { label: "Type",       required: true,  type: "string" },
      frequency: { label: "Fréquence", required: false, type: "string" },
      category:  { label: "Catégorie", required: false, type: "string" },
      startDate: { label: "Date début",required: false, type: "date" },
    },
  },
  all: { label: "Tous les modules", fields: {} },
};

/* ───────────── Types Import livraison ───────────── */
type ImportDetail = {
  codeBar?: string;
  tracking?: string;
  status: string;
  action?: string;
  error?: string;
  reason?: string;
  missingFields?: string[];
};

type ImportResults = {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  details: ImportDetail[];
};

/* ════════════════════════════════════════════════════
   PAGE PRINCIPALE
════════════════════════════════════════════════════ */
export default function ImportPage() {
  const [tab, setTab] = useState<"delivery" | "excel">("delivery");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Import</h1>
        <p className="text-muted-foreground mt-1 text-sm lg:text-base">
          Importez des commandes depuis Colissimo / InstaDelivery, ou depuis un fichier Excel.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {[
          { id: "delivery", label: "Anciennes commandes livraison", icon: <Truck className="h-4 w-4" /> },
          { id: "excel",    label: "Import Excel",                  icon: <FileSpreadsheet className="h-4 w-4" /> },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === "delivery" ? <DeliveryImportTab /> : <ExcelImportTab />}
    </div>
  );
}

/* ════════════════════════════════════════════════════
   TAB : IMPORT LIVRAISON
════════════════════════════════════════════════════ */
function DeliveryImportTab() {
  const [provider, setProvider] = useState<"AUTO" | "COLISSIMO" | "INSTADELIVERY">("AUTO");
  const [codesText, setCodesText] = useState("");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const codes = useMemo(() => parseTrackingCodes(codesText), [codesText]);

  async function handleImport() {
    if (codes.length === 0) {
      setError("Collez au moins un tracking / codeBar.");
      return;
    }
    setImporting(true);
    setError("");
    setMessage("");
    setResults(null);

    try {
      let endpoint = "";
      let body: object = {};

      if (provider === "COLISSIMO") {
        endpoint = "/api/colissimo/import";
        body = { codeBars: codes };
      } else if (provider === "INSTADELIVERY") {
        endpoint = "/api/insta-delivery/import";
        body = { trackingNumbers: codes };
      } else {
        // AUTO : essayer Colissimo d'abord, puis InstaDelivery
        const allResults: ImportResults = { imported: 0, updated: 0, skipped: 0, failed: 0, details: [] };

        for (const code of codes) {
          // Essayer Colissimo
          const resC = await fetch("/api/colissimo/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codeBars: [code] }),
          });
          const dataC = await resC.json();
          const detC = dataC.results?.details?.[0];

          if (detC && detC.status !== "FAILED" && detC.status !== "ERROR") {
            allResults.imported += dataC.results?.imported ?? 0;
            allResults.updated += dataC.results?.updated ?? 0;
            allResults.details.push({ codeBar: code, ...detC });
            continue;
          }

          // Fallback InstaDelivery
          const resI = await fetch("/api/insta-delivery/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trackingNumbers: [code] }),
          });
          const dataI = await resI.json();
          const detI = dataI.results?.details?.[0];
          allResults.imported += dataI.results?.imported ?? 0;
          allResults.updated += dataI.results?.updated ?? 0;
          allResults.skipped += dataI.results?.skipped ?? 0;
          allResults.failed += dataI.results?.failed ?? 0;
          allResults.details.push({ tracking: code, ...(detI ?? { status: "FAILED", error: "Non trouvé sur aucun provider" }) });
        }

        setResults(allResults);
        setMessage(`Import terminé : ${allResults.imported} importées, ${allResults.updated} mises à jour, ${allResults.failed} erreurs`);
        setImporting(false);
        return;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.success && !data.results) {
        setError(data.message || "Erreur import");
      } else {
        setResults(data.results ?? null);
        setMessage(data.message || "Import terminé");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    }

    setImporting(false);
  }

  const statusColor = (s: string) => {
    if (s === "imported" || s === "DELIVERED" || s === "DELIVERED_CLOSED" || s === "PAID_DELIVERED") return "text-emerald-500";
    if (s === "updated") return "text-blue-500";
    if (s === "SKIPPED" || s === "skipped") return "text-yellow-500";
    if (s === "FAILED" || s === "ERROR") return "text-rose-500";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      {/* Provider selector */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" /> Sélectionner le provider
        </h2>
        <div className="flex flex-wrap gap-3">
          {(["AUTO", "COLISSIMO", "INSTADELIVERY"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                provider === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-input text-muted-foreground hover:bg-muted"
              )}
            >
              {p === "AUTO" ? "Auto-détection" : p === "COLISSIMO" ? "Colissimo" : "InstaDelivery"}
            </button>
          ))}
        </div>
        {provider === "AUTO" && (
          <p className="text-xs text-muted-foreground">
            Chaque code sera essayé sur Colissimo d&apos;abord, puis InstaDelivery si non trouvé.
          </p>
        )}
        {provider === "INSTADELIVERY" && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ Le tracking InstaDelivery retourne parfois des données partielles. Les champs manquants peuvent être complétés manuellement depuis la page Commandes.
          </p>
        )}
      </div>

      {/* Textarea codes */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-semibold">Tracking / CodeBar</h2>
        <p className="text-xs text-muted-foreground">
          Collez plusieurs codes séparés par des sauts de ligne, virgules ou points-virgules.
        </p>
        <textarea
          className="w-full h-36 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder={"COL123456789\nCOL987654321\nINSTA-ABC-001"}
          value={codesText}
          onChange={(e) => setCodesText(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {codes.length} code{codes.length > 1 ? "s" : ""} détecté{codes.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* Alertes */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {message && !results && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0" /> {message}
        </div>
      )}

      {/* Bouton import */}
      <button
        onClick={handleImport}
        disabled={importing || codes.length === 0}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {importing ? (
          <><RefreshCw className="h-4 w-4 animate-spin" />Import en cours...</>
        ) : (
          <><Upload className="h-4 w-4" />Importer {codes.length > 0 ? `${codes.length} commande${codes.length > 1 ? "s" : ""}` : "les commandes"}</>
        )}
      </button>

      {/* Résultats */}
      {results && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-emerald-500" />
            <h2 className="text-lg font-semibold">Résultat de l&apos;import</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Importées"   value={results.imported} color="bg-emerald-500/10 text-emerald-500" />
            <SummaryCard label="Mises à jour" value={results.updated}  color="bg-blue-500/10 text-blue-500" />
            <SummaryCard label="Ignorées"    value={results.skipped}  color="bg-yellow-500/10 text-yellow-500" />
            <SummaryCard label="Erreurs"     value={results.failed}   color="bg-rose-500/10 text-rose-500" />
          </div>

          {results.details.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Code</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Statut</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Détail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.details.map((d, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">{d.codeBar ?? d.tracking ?? "—"}</td>
                      <td className={`px-4 py-2 font-medium ${statusColor(d.action ?? d.status)}`}>
                        {d.action === "imported" ? "✓ Importé" :
                         d.action === "updated"  ? "↑ Mis à jour" :
                         d.status === "SKIPPED"  ? "⚠ Ignoré" :
                         d.status === "FAILED" || d.status === "ERROR" ? "✗ Erreur" :
                         d.status}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {d.error ?? d.reason ?? (d.missingFields?.length ? `Champs manquants: ${d.missingFields.join(", ")}` : d.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            onClick={() => { setResults(null); setMessage(""); setCodesText(""); }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm"
          >
            <Upload className="h-4 w-4" /> Nouvel import
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`p-4 rounded-lg ${color} text-center`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-1 opacity-80">{label}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   TAB : IMPORT EXCEL (repris de l'original)
════════════════════════════════════════════════════ */
function ExcelImportTab() {
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [target, setTarget] = useState<ImportTarget>("products");
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; ignored: number; errors: string[] } | null>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.match(/\.(xlsx|xls)$/i)) { setError("Fichier Excel requis (.xlsx ou .xls)"); return; }
    setFile(f); setError(""); setSuccess(""); setResult(null);
    try {
      const fd = new FormData(); fd.append("file", f);
      const res = await fetch("/api/import/excel", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur lecture"); return; }
      setColumns(data.columns || []); setRows(data.rows || []);
      setSuccess(`${data.rows?.length || 0} lignes détectées`);
    } catch { setError("Erreur lecture fichier"); }
  }, []);

  const targetInfo = TARGET_FIELDS[target];
  const availableFields = Object.entries(targetInfo.fields).map(([k, v]) => ({ key: k, ...v }));

  const autoMap = useCallback(() => {
    const nm: ColumnMapping[] = [];
    for (const col of columns) {
      const cl = col.toLowerCase();
      for (const f of availableFields) {
        if (cl.includes(f.key.toLowerCase()) || cl.includes(f.label.toLowerCase())) {
          nm.push({ excelColumn: col, targetField: f.key }); break;
        }
      }
    }
    setMappings(nm);
  }, [columns, availableFields]);

  const updateMapping = useCallback((col: string, field: string) => {
    setMappings((prev) => {
      const existing = prev.filter((m) => m.excelColumn !== col);
      if (field) existing.push({ excelColumn: col, targetField: field });
      return existing;
    });
  }, []);

  const mappedRows = useMemo(() => {
    if (!rows.length || !mappings.length) return [];
    return rows.slice(0, 10).map((row) => {
      const m: Record<string, unknown> = {};
      for (const mp of mappings) { if (row[mp.excelColumn] != null) m[mp.targetField] = row[mp.excelColumn]; }
      return m;
    });
  }, [rows, mappings]);

  async function validateAndImport() {
    setImporting(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mappings, target }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur import"); return; }
      setResult(data); setSuccess(`${data.imported} lignes importées`);
      setFile(null); setRows([]); setColumns([]); setMappings([]);
    } catch { setError("Erreur import"); }
    finally { setImporting(false); }
  }

  function reset() { setFile(null); setColumns([]); setRows([]); setMappings([]); setError(""); setSuccess(""); setResult(null); }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {success && <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">{success}</div>}

      {!file && (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center">
          <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">Télécharger un fichier Excel</p>
          <p className="text-sm text-muted-foreground mb-4">Formats: .xlsx, .xls</p>
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 cursor-pointer">
            <FileSpreadsheet className="h-4 w-4" /> Choisir un fichier
            <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
          </label>
        </div>
      )}

      {file && !result && (
        <>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
              <span className="font-medium">{file.name}</span>
              <span className="text-sm text-muted-foreground">({rows.length} lignes)</span>
            </div>
            <button onClick={reset} className="p-2 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-medium mb-2 block">Type de données</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TARGET_FIELDS).filter(([k]) => k !== "all").map(([key, info]) => (
                <button key={key} onClick={() => setTarget(key as ImportTarget)}
                  className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    target === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
                  {info.label}
                </button>
              ))}
            </div>
          </div>

          {columns.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Correspondance des colonnes</h2>
                <button onClick={autoMap} className="text-sm text-primary hover:underline">Mapping automatique</button>
              </div>
              <div className="space-y-2">
                {columns.map((col) => {
                  const mp = mappings.find((m) => m.excelColumn === col);
                  return (
                    <div key={col} className="flex items-center gap-4">
                      <span className="w-1/3 text-sm font-medium truncate">{col}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <select value={mp?.targetField || ""} onChange={(e) => updateMapping(col, e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-sm">
                        <option value="">-- Non importé --</option>
                        {availableFields.map((f) => (
                          <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {mappedRows.length > 0 && (
            <button onClick={validateAndImport} disabled={importing}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
              {importing ? <><RefreshCw className="h-4 w-4 animate-spin" />Import en cours...</> : <><Upload className="h-4 w-4" />Importer {rows.length} lignes</>}
            </button>
          )}
        </>
      )}

      {result && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4"><Check className="h-6 w-6 text-emerald-500" /><h2 className="text-lg font-semibold">Résultat</h2></div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-4 rounded-lg bg-emerald-500/10 text-center"><p className="text-2xl font-bold text-emerald-500">{result.imported}</p><p className="text-sm text-muted-foreground">Importées</p></div>
            <div className="p-4 rounded-lg bg-amber-500/10 text-center"><p className="text-2xl font-bold text-amber-500">{result.ignored}</p><p className="text-sm text-muted-foreground">Ignorées</p></div>
            <div className="p-4 rounded-lg bg-rose-500/10 text-center"><p className="text-2xl font-bold text-rose-500">{result.errors.length}</p><p className="text-sm text-muted-foreground">Erreurs</p></div>
          </div>
          {result.errors.length > 0 && (
            <div className="space-y-1 mb-4">
              <p className="text-sm font-medium">Erreurs :</p>
              {result.errors.slice(0, 10).map((e, i) => <p key={i} className="text-xs text-muted-foreground">{e}</p>)}
            </div>
          )}
          <button onClick={reset} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted">
            <Upload className="h-4 w-4" /> Importer un autre fichier
          </button>
        </div>
      )}
    </div>
  );
}
