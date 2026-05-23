"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Truck, CheckCircle, AlertCircle, RefreshCw, Trash2, Pencil, DollarSign,
  Filter, Eye, X, ChevronDown, Package, ArrowUpCircle,
} from "lucide-react";

type Revenue = {
  id: string;
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
};

type Filters = {
  provider: string;
  paymentStatus: string;
  validated: string;
};

const PROVIDER_LABELS: Record<string, string> = {
  COLISSIMO: "Colissimo",
  INSTADELIVERY: "InstaDelivery",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING:    { label: "En attente",  color: "bg-yellow-500/10 text-yellow-500" },
  RECEIVED:   { label: "Reçu",        color: "bg-blue-500/10 text-blue-500" },
  VALIDATED:  { label: "Validé",      color: "bg-emerald-500/10 text-emerald-500" },
};

export default function RevenueLivraisonPage() {
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>({ provider: "", paymentStatus: "", validated: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [validating, setValidating] = useState<string | null>(null);
  const [resyncing, setResyncing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Revenue | null>(null);
  const [detailRevenue, setDetailRevenue] = useState<Revenue | null>(null);
  const [editRevenue, setEditRevenue] = useState<Revenue | null>(null);
  const [editForm, setEditForm] = useState({ amount: "", paymentStatus: "", customerName: "" });

  const loadRevenues = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.provider) params.set("provider", filters.provider);
    if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
    if (filters.validated) params.set("validated", filters.validated);

    const [revRes, statsRes] = await Promise.all([
      fetch(`/api/delivery-revenue?${params}`),
      fetch("/api/delivery-revenue?statsOnly=true"),
    ]);
    const revData = await revRes.json();
    const statsData = await statsRes.json();
    setRevenues(revData.revenues || []);
    setStats(statsData);
    setLoading(false);
  }, [filters]);

  useEffect(() => { loadRevenues(); }, [loadRevenues]);

  const flash = (msg: string, isErr = false) => {
    if (isErr) setError(msg); else setMessage(msg);
    setTimeout(() => { setError(""); setMessage(""); }, 5000);
  };

  async function handleValidate(rev: Revenue) {
    setValidating(rev.id);
    const res = await fetch("/api/delivery-revenue/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "validate", revenueId: rev.id }),
    });
    const data = await res.json();
    if (data.success) { flash(data.message); await loadRevenues(); }
    else flash(data.message || data.error, true);
    setValidating(null);
  }

  async function handleResync(rev: Revenue) {
    setResyncing(rev.id);
    const res = await fetch("/api/delivery-revenue/resync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revenueId: rev.id }),
    });
    const data = await res.json();
    if (data.success) { flash(data.message); await loadRevenues(); }
    else flash(data.message, true);
    setResyncing(null);
  }

  async function handleDelete(rev: Revenue) {
    setDeleting(rev.id);
    const res = await fetch(`/api/delivery-revenue?id=${rev.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) { flash("Supprimé"); setConfirmDelete(null); await loadRevenues(); }
    else flash(data.message, true);
    setDeleting(null);
  }

  async function handleEdit() {
    if (!editRevenue) return;
    const res = await fetch(`/api/delivery-revenue?id=${editRevenue.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: editForm.amount,
        paymentStatus: editForm.paymentStatus,
        customerName: editForm.customerName,
      }),
    });
    const data = await res.json();
    if (data.success) { flash("Modifié"); setEditRevenue(null); await loadRevenues(); }
    else flash(data.message, true);
  }

  const totalValidated = revenues.filter((r) => r.isValidated).reduce((s, r) => s + r.amount, 0);
  const totalPending = revenues.filter((r) => !r.isValidated).reduce((s, r) => s + r.amount, 0);
  const colissimoRevs = revenues.filter((r) => r.provider === "COLISSIMO");
  const instaRevs = revenues.filter((r) => r.provider === "INSTADELIVERY");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Truck className="h-7 w-7 text-primary" />
            Revenus Livraison
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Paiements importés depuis Colissimo & InstaDelivery. Validez pour inclure au chiffre d&apos;affaires.
          </p>
        </div>
        <button
          onClick={loadRevenues}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-input bg-background hover:bg-muted text-sm font-medium"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total validé (CA)" value={`${totalValidated.toFixed(2)} DT`} color="text-emerald-500" icon={<CheckCircle className="h-4 w-4" />} />
        <StatCard label="En attente validation" value={`${totalPending.toFixed(2)} DT`} color="text-yellow-500" icon={<DollarSign className="h-4 w-4" />} />
        <StatCard label="Colissimo" value={`${colissimoRevs.length} colis`} color="text-blue-500" icon={<Package className="h-4 w-4" />} />
        <StatCard label="InstaDelivery" value={`${instaRevs.length} livraisons`} color="text-purple-500" icon={<Truck className="h-4 w-4" />} />
      </div>

      {/* Alerts */}
      {error && <Alert type="error" msg={error} />}
      {message && <Alert type="success" msg={message} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" /> Filtres
        </div>
        <select
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          value={filters.provider}
          onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value }))}
        >
          <option value="">Tous les providers</option>
          <option value="COLISSIMO">Colissimo</option>
          <option value="INSTADELIVERY">InstaDelivery</option>
        </select>
        <select
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          value={filters.paymentStatus}
          onChange={(e) => setFilters((f) => ({ ...f, paymentStatus: e.target.value }))}
        >
          <option value="">Tous les statuts</option>
          <option value="PENDING">En attente</option>
          <option value="RECEIVED">Reçu</option>
          <option value="VALIDATED">Validé</option>
        </select>
        <select
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          value={filters.validated}
          onChange={(e) => setFilters((f) => ({ ...f, validated: e.target.value }))}
        >
          <option value="">Validé/Non validé</option>
          <option value="true">Validé uniquement</option>
          <option value="false">Non validé uniquement</option>
        </select>
        {(filters.provider || filters.paymentStatus || filters.validated) && (
          <button
            onClick={() => setFilters({ provider: "", paymentStatus: "", validated: "" })}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Provider</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tracking / Réf</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Montant</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Frais livr.</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ret. source</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut API</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paiement</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Validé</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {revenues.map((rev) => {
                const ps = STATUS_LABELS[rev.paymentStatus ?? ""] ?? { label: rev.paymentStatus ?? "—", color: "bg-muted text-muted-foreground" };
                return (
                  <tr key={rev.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${rev.provider === "COLISSIMO" ? "bg-blue-500/10 text-blue-600" : "bg-purple-500/10 text-purple-600"}`}>
                        {PROVIDER_LABELS[rev.provider] ?? rev.provider}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <div>{rev.trackingNumber ?? "—"}</div>
                      {rev.reference && rev.reference !== rev.trackingNumber && (
                        <div className="text-muted-foreground">{rev.reference}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{rev.customerName ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{rev.amount.toFixed(2)} DT</td>
                    <td className="px-4 py-3 text-muted-foreground">{rev.deliveryFee.toFixed(2)} DT</td>
                    <td className="px-4 py-3 text-muted-foreground">{(rev.withholdingTaxApplied || 0).toFixed(2)} DT</td>
                    <td className="px-4 py-3 text-xs">{rev.apiStatus ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${ps.color}`}>
                        {ps.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {rev.isValidated ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                          <CheckCircle className="h-3 w-3" />
                          {rev.validatedAt ? new Date(rev.validatedAt).toLocaleDateString("fr-FR") : "Oui"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Non</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {!rev.isValidated && (
                          <button
                            onClick={() => handleValidate(rev)}
                            disabled={validating === rev.id}
                            title="Valider paiement"
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white px-2.5 py-1.5 text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <ArrowUpCircle className="h-3 w-3" />
                            {validating === rev.id ? "..." : "Valider"}
                          </button>
                        )}
                        <button
                          onClick={() => setDetailRevenue(rev)}
                          title="Voir détail"
                          className="p-1.5 rounded-lg border border-input hover:bg-muted"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleResync(rev)}
                          disabled={resyncing === rev.id}
                          title="Resynchroniser"
                          className="p-1.5 rounded-lg border border-input hover:bg-muted"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${resyncing === rev.id ? "animate-spin" : ""}`} />
                        </button>
                        <button
                          onClick={() => { setEditRevenue(rev); setEditForm({ amount: String(rev.amount), paymentStatus: rev.paymentStatus ?? "", customerName: rev.customerName ?? "" }); }}
                          title="Modifier"
                          className="p-1.5 rounded-lg border border-input hover:bg-muted"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(rev)}
                          title="Supprimer"
                          className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {revenues.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-muted-foreground">
                    {loading ? "Chargement..." : "Aucun revenu livraison. Importez des commandes depuis la page Importer."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Détail */}
      {detailRevenue && (
        <Modal title="Détail revenu" onClose={() => setDetailRevenue(null)}>
          <dl className="space-y-3 text-sm">
            {[
              ["Provider", PROVIDER_LABELS[detailRevenue.provider] ?? detailRevenue.provider],
              ["Tracking", detailRevenue.trackingNumber ?? "—"],
              ["Référence", detailRevenue.reference],
              ["Client", detailRevenue.customerName ?? "—"],
              ["Montant", `${detailRevenue.amount.toFixed(2)} DT`],
              ["Frais livraison", `${detailRevenue.deliveryFee.toFixed(2)} DT`],
              ["Frais retour", `${detailRevenue.returnFee.toFixed(2)} DT`],
              ["Retenue source", `${(detailRevenue.withholdingTaxApplied || 0).toFixed(2)} DT`],
              ["Statut API", detailRevenue.apiStatus ?? "—"],
              ["Numéro paiement", detailRevenue.paymentNumber ?? "—"],
              ["Statut paiement", detailRevenue.paymentStatus ?? "—"],
              ["Validé", detailRevenue.isValidated ? `Oui — ${detailRevenue.validatedAt ? new Date(detailRevenue.validatedAt).toLocaleString("fr-FR") : ""}` : "Non"],
              ["Importé le", new Date(detailRevenue.importedAt).toLocaleString("fr-FR")],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}

      {/* Modal Modifier */}
      {editRevenue && (
        <Modal title="Modifier le revenu" onClose={() => setEditRevenue(null)}>
          <div className="space-y-4">
            <Field label="Montant (DT)">
              <input type="number" step="0.01" className="input-base" value={editForm.amount}
                onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))} />
            </Field>
            <Field label="Client">
              <input type="text" className="input-base" value={editForm.customerName}
                onChange={(e) => setEditForm((f) => ({ ...f, customerName: e.target.value }))} />
            </Field>
            <Field label="Statut paiement">
              <select className="input-base" value={editForm.paymentStatus}
                onChange={(e) => setEditForm((f) => ({ ...f, paymentStatus: e.target.value }))}>
                <option value="PENDING">En attente</option>
                <option value="RECEIVED">Reçu</option>
                <option value="VALIDATED">Validé</option>
              </select>
            </Field>
            <button onClick={handleEdit} className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 font-medium hover:opacity-90">
              Enregistrer
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Suppression */}
      {confirmDelete && (
        <Modal title="Confirmer la suppression" onClose={() => setConfirmDelete(null)}>
          <p className="text-muted-foreground mb-6">
            Supprimer le revenu <strong>{confirmDelete.trackingNumber ?? confirmDelete.reference}</strong> de{" "}
            <strong>{confirmDelete.amount.toFixed(2)} DT</strong> ?
          </p>
          <div className="flex gap-3">
            <button onClick={() => handleDelete(confirmDelete)} disabled={deleting === confirmDelete.id}
              className="flex-1 rounded-lg bg-rose-600 text-white px-4 py-2.5 font-medium hover:bg-rose-700 disabled:opacity-50">
              {deleting === confirmDelete.id ? "..." : "Supprimer"}
            </button>
            <button onClick={() => setConfirmDelete(null)}
              className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 font-medium hover:bg-muted">
              Annuler
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`flex items-center gap-2 text-xs text-muted-foreground mb-1`}>{icon}{label}</div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Alert({ type, msg }: { type: "error" | "success"; msg: string }) {
  const cls = type === "error"
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  const Icon = type === "error" ? AlertCircle : CheckCircle;
  return (
    <div className={`rounded-lg border ${cls} px-4 py-3 text-sm flex items-center gap-2`}>
      <Icon className="h-4 w-4 shrink-0" /> {msg}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}
