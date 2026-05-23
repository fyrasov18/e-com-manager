"use client";

import { FormEvent, useEffect, useState, useCallback } from "react";
import { Truck, Plus, TestTube, Trash2, X, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Upload, Package, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";

type InstaConfig = {
  id: string;
  name: string;
  carrier: string;
  deliveryType: string;
  trackingEnabled: boolean;
  webhookEnabled: boolean;
  labelCreationEnabled: boolean;
  isActive: boolean;
  lastTested: string | null;
  lastError: string | null;
  createdAt: string;
};

type ConfirmState = {
  show: boolean;
  configId?: string;
  configName?: string;
};

export default function InstaDeliveryPage() {
  const [configs, setConfigs] = useState<InstaConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ConfirmState>({ show: false });
  const [deleting, setDeleting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; failed: number; details: { tracking: string; status: string; error?: string }[] } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "Colissimo avec InstaDelivery",
    carrier: "Colissimo",
    deliveryType: "standard",
    trackingEnabled: true,
    webhookEnabled: true,
    labelCreationEnabled: true,
    login: "",
    password: "",
  });

  const loadConfigs = useCallback(async () => {
    const res = await fetch("/api/insta-delivery");
    if (!res.ok) return;
    const data = await res.json();
    setConfigs(data.configs || []);
  }, []);

  useEffect(() => {
    setTimeout(() => { loadConfigs(); }, 0);
  }, [loadConfigs]);

  function resetForm() {
    setForm({
      name: "Colissimo avec InstaDelivery",
      carrier: "Colissimo",
      deliveryType: "standard",
      trackingEnabled: true,
      webhookEnabled: true,
      labelCreationEnabled: true,
      login: "",
      password: "",
    });
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.login || !form.password) {
      setError("Login et password requis");
      return;
    }
    if (!form.name.trim()) {
      setError("Le nom de la configuration est requis");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const res = await fetch("/api/insta-delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, action: "save" }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      setError(payload.message ?? "Enregistrement échoué.");
      setLoading(false);
      return;
    }

    setMessage(payload.message ?? "Configuration enregistrée.");
    resetForm();
    await loadConfigs();
    setLoading(false);
  }

  async function testConnection(configId: string) {
    setTesting(true);
    setError("");
    setMessage("");

    const res = await fetch("/api/insta-delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", configId }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      setError(payload.message ?? "Test échoué.");
      setTesting(false);
      return;
    }

    setMessage(payload.message ?? "Connexion réussie!");
    await loadConfigs();
    setTesting(false);
  }

  async function handleDelete() {
    if (!confirmDelete.configId) return;
    setDeleting(true);
    setError("");

    try {
      const res = await fetch("/api/insta-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", configId: confirmDelete.configId }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setError(payload.message ?? "Erreur lors de la suppression.");
        setConfirmDelete({ show: false });
        setDeleting(false);
        return;
      }

      setMessage(payload.message ?? "Configuration supprimée.");
      setConfirmDelete({ show: false });
      await loadConfigs();
    } catch {
      setError("Erreur lors de la suppression.");
    }

    setDeleting(false);
  }

  async function handleImport() {
    if (!importText.trim()) {
      setError("Entrez des numéros de tracking");
      return;
    }

    const trackingNumbers = importText.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);
    if (trackingNumbers.length === 0) {
      setError("Aucun numéro de tracking valide");
      return;
    }

    setImporting(true);
    setError("");
    setMessage("");
    setImportResult(null);

    try {
      const res = await fetch("/api/insta-delivery/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumbers }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setError(payload.message ?? "Import échoué.");
        setImporting(false);
        return;
      }

      setMessage(payload.message ?? "Import terminé!");
      setImportResult(payload.results);
      setImportText("");
    } catch {
      setError("Erreur lors de l'import");
    }

    setImporting(false);
  }

  function startEdit(config: InstaConfig) {
    setForm({
      name: config.name,
      carrier: config.carrier,
      deliveryType: config.deliveryType,
      trackingEnabled: config.trackingEnabled,
      webhookEnabled: config.webhookEnabled,
      labelCreationEnabled: config.labelCreationEnabled,
      login: "***configured***",
      password: "",
    });
    setEditingId(config.id);
    setShowForm(true);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
              <Truck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                InstaDelivery
              </h1>
              <p className="text-muted-foreground mt-1 text-sm lg:text-base">
                Configurations de livraison via API.
              </p>
            </div>
          </div>
        </div>
        <a
          href="https://app.insta-delivery.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Voir dashboard InstaDelivery
        </a>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}

      {/* Liste des configurations */}
      {configs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 lg:p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="h-5 w-5" />
            Configurations existantes ({configs.length})
          </h2>
          <div className="space-y-3">
            {configs.map((config) => (
              <div key={config.id} className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{config.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Transporteur: {config.carrier} • Type: {config.deliveryType === "standard" ? "Livraison standard" : config.deliveryType}
                    </p>
                  </div>
                  <span className={cn(
                    "badge-status text-xs",
                    config.isActive ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"
                  )}>
                    {config.isActive ? "● Actif" : "Inactif"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {config.trackingEnabled && <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400">Suivi activé</span>}
                  {config.webhookEnabled && <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-400">Webhook actif</span>}
                  {config.labelCreationEnabled && <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400">Étiquettes activées</span>}
                </div>
                {config.lastError && (
                  <div className="text-xs text-destructive">Dernière erreur: {config.lastError}</div>
                )}
                {config.lastTested && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    Dernier test: {new Date(config.lastTested).toLocaleString("fr-FR")}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => testConnection(config.id)}
                    disabled={testing}
                    className="px-3 py-1.5 rounded-lg border border-input bg-background text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <TestTube className="h-3 w-3" />
                    {testing ? "Test..." : "Tester"}
                  </button>
                  <button
                    onClick={() => startEdit(config)}
                    className="px-3 py-1.5 rounded-lg border border-input bg-background text-xs font-medium hover:bg-accent transition-colors flex items-center gap-1"
                  >
                    <Edit2 className="h-3 w-3" />
                    Modifier
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ show: true, configId: config.id, configName: config.name })}
                    className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-medium hover:bg-rose-500/20 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bouton pour ajouter une nouvelle configuration */}
      {!showForm && (
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 p-5 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-5 w-5" />
          Ajouter une nouvelle configuration
        </button>
      )}

      {/* Formulaire de configuration */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 lg:p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {editingId ? "Modifier la configuration" : "Nouvelle configuration InstaDelivery"}
          </h2>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Nom de la configuration <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
                  placeholder="ex: Colissimo avec InstaDelivery"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Transporteur <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
                  placeholder="ex: Colissimo"
                  value={form.carrier}
                  onChange={(e) => setForm((prev) => ({ ...prev, carrier: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Fournisseur API</label>
              <input
                type="text"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors opacity-60"
                value="InstaDelivery"
                disabled
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Type de livraison</label>
              <select
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
                value={form.deliveryType}
                onChange={(e) => setForm((prev) => ({ ...prev, deliveryType: e.target.value }))}
              >
                <option value="standard">Livraison standard / Livraison à domicile</option>
                <option value="express">Livraison express</option>
                <option value="pickup">Point de retrait</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium mb-2">Options</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.trackingEnabled}
                    onChange={(e) => setForm((prev) => ({ ...prev, trackingEnabled: e.target.checked }))}
                    className="rounded border-input"
                  />
                  Suivi colis activé
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.webhookEnabled}
                    onChange={(e) => setForm((prev) => ({ ...prev, webhookEnabled: e.target.checked }))}
                    className="rounded border-input"
                  />
                  Webhook de mise à jour du statut
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.labelCreationEnabled}
                    onChange={(e) => setForm((prev) => ({ ...prev, labelCreationEnabled: e.target.checked }))}
                    className="rounded border-input"
                  />
                  Création d&apos;étiquette d&apos;expédition
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Login API <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
                  placeholder="Votre login InstaDelivery"
                  value={form.login}
                  onChange={(e) => setForm((prev) => ({ ...prev, login: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Mot de passe API <span className="text-destructive">*</span></label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
                  placeholder={editingId ? "Laisser vide = inchangé" : "Votre mot de passe InstaDelivery"}
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  required={!editingId}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {loading ? "Enregistrement..." : editingId ? "Mettre à jour" : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 rounded-lg border border-input bg-background font-medium hover:bg-accent transition-colors flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Import section */}
      {configs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 lg:p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importer d&apos;anciennes commandes
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Collez une liste de numéros de tracking (un par ligne ou séparés par des virgules) pour récupérer les commandes avec leur statut.
          </p>
          <textarea
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono min-h-[120px] outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            placeholder="TRACKING123&#10;TRACKING456&#10;TRACKING789"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {importing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Import en cours...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Importer les commandes
                </>
              )}
            </button>
          </div>
          {importResult && (
            <div className="mt-4 p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-emerald-500">
                  <CheckCircle className="h-4 w-4" />
                  {importResult.imported} importées
                </span>
                <span className="flex items-center gap-1 text-blue-500">
                  <Package className="h-4 w-4" />
                  {importResult.updated} mises à jour
                </span>
                <span className="flex items-center gap-1 text-rose-500">
                  <AlertCircle className="h-4 w-4" />
                  {importResult.failed} échouées
                </span>
              </div>
              {importResult.details.slice(0, 10).map((item, idx) => (
                <div key={idx} className="text-xs font-mono flex items-center gap-2">
                  <span className={item.error ? "text-rose-500" : "text-muted-foreground"}>
                    {item.tracking}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className={item.error ? "text-rose-400" : "text-emerald-500"}>
                    {item.error || item.status}
                  </span>
                </div>
              ))}
              {importResult.details.length > 10 && (
                <p className="text-xs text-muted-foreground">
                  ...et {importResult.details.length - 10} autres
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmation de suppression */}
      {confirmDelete.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold mb-4">Confirmer la suppression</h3>
            <p className="text-muted-foreground mb-6">
              Êtes-vous sûr de vouloir supprimer la configuration &quot;{confirmDelete.configName}&quot; ? Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-lg bg-rose-600 text-white px-4 py-2.5 font-medium hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Suppression..." : "Confirmer"}
              </button>
              <button
                onClick={() => setConfirmDelete({ show: false })}
                className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 font-medium hover:bg-accent flex items-center justify-center gap-2"
              >
                <X className="h-4 w-4" />
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
