"use client";
import { FormEvent, useEffect, useState } from "react";
import { Truck, TestTube, RefreshCw } from "lucide-react";

export default function IntigoPage() {
  const [cfg, setCfg] = useState<any>(null);
  const [apiKey, setApiKey] = useState("");
  const [pickup, setPickup] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

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
    const r = await fetch("/api/intigo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", apiKey: apiKey.trim() || undefined, defaultPickupIndex: pickup === "" ? null : Number(pickup) }) });
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

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-sky-600 flex items-center justify-center"><Truck className="h-5 w-5 text-white" /></div>
        <div><h1 className="text-lg font-semibold">Intigo Partner V3</h1><p className="text-xs text-muted-foreground">Clé chiffrée, jamais exposée. Base https://api.intigo.net/api/v3</p></div>
      </div>
      <div className="rounded-xl border border-border p-5 bg-card space-y-3">
        <p className="text-sm">{cfg?.configured ? `Configuré (${cfg.source}) — ${cfg.maskedKey}` : "Non configuré"}</p>
        {cfg?.lastError && <p className="text-xs text-destructive">{cfg.lastError}</p>}
        <form onSubmit={save} className="space-y-3">
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Clé API (vide = conserver)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="pickup_index défaut (ex. 0)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button disabled={busy} className="rounded-lg bg-sky-600 text-white px-4 py-2 text-sm">Enregistrer</button>
            <button type="button" onClick={test} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm inline-flex items-center gap-1"><TestTube className="h-4 w-4" />Tester</button>
          </div>
        </form>
        {msg && <p className="text-sm text-emerald-400">{msg}</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
      <div className="rounded-xl border border-border p-4 text-xs text-muted-foreground">
        Villes: GET /api/intigo/geo?kind=cities — Délégations: kind=districts&amp;city_id — Quartiers: kind=neighborhoods&amp;district_id — Ramassage: kind=pickups. Création: POST /api/intigo/shipment (orderId + destination).
      </div>
    </div>
  );
}
