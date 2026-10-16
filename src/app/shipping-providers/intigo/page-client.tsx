"use client";
import { FormEvent, useEffect, useState } from "react";
import { Truck, TestTube, RefreshCw, Upload, CheckCircle, AlertCircle, Package } from "lucide-react";
import { parseTrackingCodes } from "@/lib/tracking-utils";

export default function IntigoPage() {
  const [cfg, setCfg] = useState<any>(null);
  const [apiKey, setApiKey] = useState("");
  const [pickup, setPickup] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Import state
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importErr, setImportErr] = useState("");
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    failed: number;
    details: { tracking: string; status: string; error?: string; action?: string }[];
  } | null>(null);

  async function load() {
    const r = await fetch("/api/intigo");
    const d = await r.json();
    setCfg(d);
    if (d.defaultPickupIndex !== null && d.defaultPickupIndex !== undefined) setPickup(String(d.defaultPickupIndex));
  }
  useEffect(() => { load(); }, []);

  async function save(e: FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    if (!cfg?.configured && !apiKey.trim()) { setErr("Clé API requise."); return; }
    setBusy(true);
    const r = await fetch("/api/intigo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", apiKey: apiKey.trim() || undefined, defaultPickupIndex: pickup === "" ? null : Number(pickup) }),
    });
    const d = await r.json();
    if (!d.success) setErr(d.message || "Échec."); else { setMsg(d.message); setApiKey(""); await load(); }
    setBusy(false);
  }

  async function test() {
    setBusy(true); setErr(""); setMsg("");
    const r = await fetch("/api/intigo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) });
    const d = await r.json();
    if (d.success) setMsg(d.message); else setErr(d.message);
    await load(); setBusy(false);
  }

  async function handleImport() {
    const codes = parseTrackingCodes(importText);
    if (codes.length === 0) {
      setImportErr("Collez au moins un code barre (ex: 8743434S8).");
      return;
    }
    setImporting(true);
    setImportErr("");
    setImportMsg("");
    setImportResult(null);

    try {
      const res = await fetch("/api/intigo/import", {
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
    }
    setImporting(false);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-sky-600 flex items-center justify-center">
          <Truck className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Intigo Partner V3</h1>
          <p className="text-xs text-muted-foreground">Clé chiffrée, jamais exposée. Base https://api.intigo.net/api/v3</p>
        </div>
      </div>

      {/* Config Card */}
      <div className="rounded-xl border border-border p-5 bg-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Configuration API</h2>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${cfg?.configured ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground border-border"}`}>
            {cfg?.configured ? `● Configuré (${cfg.source})` : "Non configuré"}
          </span>
        </div>
        {cfg?.configured && <p className="text-xs text-muted-foreground">Clé active : <span className="font-mono text-foreground">{cfg.maskedKey}</span></p>}
        {cfg?.lastError && <p className="text-xs text-destructive">Dernière erreur : {cfg.lastError}</p>}
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Clé API Intigo</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Clé API (vide = conserver la clé actuelle)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Index d&apos;enlèvement par défaut (pickup_index)</label>
            <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="pickup_index défaut (ex. 0)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2 pt-1">
            <button disabled={busy} className="rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
              {busy ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button type="button" onClick={test} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm inline-flex items-center gap-1.5 hover:bg-accent transition-colors disabled:opacity-50">
              <TestTube className="h-4 w-4" /> Tester la connexion
            </button>
          </div>
        </form>
        {msg && <p className="text-xs text-emerald-400">{msg}</p>}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>

      {/* Import Tracking Card */}
      <div className="rounded-xl border border-sky-500/30 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-sky-500" />
          <h2 className="text-sm font-semibold">Importer des codes barres Intigo</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Collez vos codes-barres Intigo (ex. <span className="font-mono text-foreground font-semibold">8743434S8</span>), un par ligne, ou séparés par des virgules.
        </p>
        <textarea
          rows={5}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={"8743434S8\n8743435S8\n8743436S8"}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        {importErr && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" /> {importErr}
          </div>
        )}
        {importMsg && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" /> {importMsg}
          </div>
        )}
        {importResult && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-muted/40 border border-border">
                <p className="text-lg font-bold font-mono text-emerald-400">{importResult.imported}</p>
                <p className="text-[10px] text-muted-foreground">Créées</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40 border border-border">
                <p className="text-lg font-bold font-mono text-blue-400">{importResult.updated}</p>
                <p className="text-[10px] text-muted-foreground">Mises à jour</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40 border border-border">
                <p className="text-lg font-bold font-mono text-rose-400">{importResult.failed}</p>
                <p className="text-[10px] text-muted-foreground">Erreurs</p>
              </div>
            </div>
            {importResult.details.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-border p-2 bg-muted/20 text-xs font-mono">
                {importResult.details.map((d, i) => (
                  <div key={i} className="flex items-center justify-between py-0.5">
                    <span className="text-foreground">{d.tracking}</span>
                    <span className={d.error ? "text-rose-400" : "text-emerald-400"}>
                      {d.error ? `Erreur: ${d.error}` : `${d.action || "OK"} (${d.status})`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          onClick={handleImport}
          disabled={importing || !importText.trim()}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {importing ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Import en cours...</>
          ) : (
            <><Upload className="h-4 w-4" /> Importer tracking Intigo</>
          )}
        </button>
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-border p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">API Endpoints disponibles :</p>
        <p>• Villes / Découpage : <code className="font-mono text-foreground">GET /api/intigo/geo?kind=cities|districts|neighborhoods|pickups</code></p>
        <p>• Expédition : <code className="font-mono text-foreground">POST /api/intigo/shipment</code></p>
        <p>• Suivi &amp; sync : <code className="font-mono text-foreground">POST /api/intigo/sync</code></p>
        <p>• Import en masse : <code className="font-mono text-foreground">POST /api/intigo/import</code></p>
      </div>
    </div>
  );
}
