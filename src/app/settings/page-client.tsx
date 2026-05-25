"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, useCallback } from "react";
import { Settings, Save, TestTube, Trash2, X, CheckCircle, AlertCircle, Package, Truck, CreditCard, Users, Globe, Building2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type PlatformSettings = {
  platformName: string;
  defaultCurrency: string;
  defaultLanguage: string;
  stockSyncEnabled: boolean;
  stockRuleColisEnleve: boolean;
  stockRuleRetourLivre: boolean;
  stockRuleRetourPlanifie: boolean;
  paymentManualValidation: boolean;
  paymentValidatedOnlyRevenue: boolean;
  statusMapping: Record<string, string>;
  hasInstaDelivery: boolean;
};

type DeliveryCostSetting = {
  provider: string;
  deliveryCost: number;
  returnCost: number;
  withholdingTaxPercent: number;
};

const DELIVERY_PROVIDER_LABELS: Record<string, string> = {
  COLISSIMO: "Colissimo",
  INSTADELIVERY: "InstaDelivery",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [confirmReset, setConfirmReset] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [deliverySettings, setDeliverySettings] = useState<DeliveryCostSetting[]>([]);
  const [savingDeliveryProvider, setSavingDeliveryProvider] = useState<string | null>(null);

  const [form, setForm] = useState({
    platformName: "E-com Manager",
    defaultCurrency: "DT",
    defaultLanguage: "fr",
    stockSyncEnabled: true,
    stockRuleColisEnleve: true,
    stockRuleRetourLivre: true,
    stockRuleRetourPlanifie: true,
    paymentManualValidation: true,
    paymentValidatedOnlyRevenue: true,
    instaLogin: "",
    instaPassword: "",
    colissimoLogin: "",
    colissimoPassword: "",
  });

  const [colissimoConfigured, setColissimoConfigured] = useState(false);

  const loadSettings = useCallback(async () => {
    const resSettings = await fetch("/api/settings");
    const resColissimo = await fetch("/api/colissimo");
    const resDeliverySettings = await fetch("/api/delivery-settings");
    const [dataSettings, dataColissimo, dataDeliverySettings] = await Promise.all([
      resSettings.json(),
      resColissimo.json(),
      resDeliverySettings.json(),
    ]);
    if (dataSettings.settings) {
      setSettings(dataSettings.settings);
      setForm((prev) => ({
        ...prev,
        platformName: dataSettings.settings.platformName || "E-com Manager",
        defaultCurrency: dataSettings.settings.defaultCurrency || "DT",
        defaultLanguage: dataSettings.settings.defaultLanguage || "fr",
        stockSyncEnabled: dataSettings.settings.stockSyncEnabled ?? true,
        stockRuleColisEnleve: dataSettings.settings.stockRuleColisEnleve ?? true,
        stockRuleRetourLivre: dataSettings.settings.stockRuleRetourLivre ?? true,
        stockRuleRetourPlanifie: dataSettings.settings.stockRuleRetourPlanifie ?? true,
        paymentManualValidation: dataSettings.settings.paymentManualValidation ?? true,
        paymentValidatedOnlyRevenue: dataSettings.settings.paymentValidatedOnlyRevenue ?? true,
        instaLogin: dataSettings.settings.hasInstaDelivery ? "***configured***" : "",
      }));
    }
    if (dataColissimo.configured) {
      setColissimoConfigured(true);
    }
    if (dataDeliverySettings.success && Array.isArray(dataDeliverySettings.settings)) {
      setDeliverySettings(
        dataDeliverySettings.settings.map((setting: DeliveryCostSetting) => ({
          ...setting,
          withholdingTaxPercent: setting.withholdingTaxPercent ?? 0,
        }))
      );
    }
  }, []);

  useEffect(() => {
    setTimeout(() => { loadSettings(); }, 0);
  }, [loadSettings]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const body: Record<string, unknown> = {
      platformName: form.platformName,
      defaultCurrency: form.defaultCurrency,
      defaultLanguage: form.defaultLanguage,
      stockSyncEnabled: form.stockSyncEnabled,
      stockRuleColisEnleve: form.stockRuleColisEnleve,
      stockRuleRetourLivre: form.stockRuleRetourLivre,
      stockRuleRetourPlanifie: form.stockRuleRetourPlanifie,
      paymentManualValidation: form.paymentManualValidation,
      paymentValidatedOnlyRevenue: form.paymentValidatedOnlyRevenue,
    };

    if (form.instaLogin && form.instaLogin !== "***configured***") {
      body.instaLogin = form.instaLogin;
    }
    if (form.instaPassword) {
      body.instaPassword = form.instaPassword;
    }

    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      setError(payload.message || "Enregistrement échoué.");
      setLoading(false);
      return;
    }

    setMessage(payload.message || "Paramètres enregistrés.");
    setForm((prev) => ({ ...prev, instaPassword: "" }));
    if (form.instaLogin !== "***configured***" && form.instaLogin) {
      setForm((prev) => ({ ...prev, instaLogin: "***configured***" }));
    }
    await loadSettings();
    setLoading(false);
  }

  async function testConnection() {
    setTesting(true);
    setError("");
    setMessage("");

    const res = await fetch("/api/insta-delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      setError(payload.message ?? "Test échoué.");
      setTesting(false);
      return;
    }

    setMessage(payload.message ?? "Connexion réussie!");
    setTesting(false);
  }

  async function handleDeleteInsta() {
    setDeleting(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeInstaDelivery: true }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      setError(payload.message || "Erreur suppression.");
      setDeleting(false);
      return;
    }

    setMessage("InstaDelivery supprimé.");
    setForm((prev) => ({ ...prev, instaLogin: "", instaPassword: "" }));
    setConfirmDelete(false);
    setDeleting(false);
    await loadSettings();
  }

  async function testColissimoConnection() {
    setTesting(true);
    setError("");
    setMessage("");

    const res = await fetch("/api/colissimo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      setError(payload.message ?? "Test échoué.");
      setTesting(false);
      return;
    }

    setMessage(payload.message ?? "Connexion Colissimo OK!");
    setTesting(false);
  }

  async function saveColissimo(event?: React.MouseEvent<HTMLButtonElement> | FormEvent<HTMLFormElement>) {
    event?.preventDefault?.();
    setLoading(true);
    setError("");
    setMessage("");

    if (!form.colissimoLogin || !form.colissimoPassword) {
      setError("Login et mot de passe requis.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/colissimo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        utilisateur: form.colissimoLogin,
        motPasse: form.colissimoPassword,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      setError(payload.message ?? "Erreur enregistrement.");
      setLoading(false);
      return;
    }

    setMessage(payload.message ?? "Configuration Colissimo enregistrée!");
    setForm((prev) => ({ ...prev, colissimoLogin: "", colissimoPassword: "" }));
    setColissimoConfigured(true);
    setLoading(false);
  }

  async function deleteColissimo() {
    setDeleting(true);
    const res = await fetch("/api/colissimo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete" }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      setError(payload.message || "Erreur suppression.");
      setDeleting(false);
      return;
    }

    setMessage("Colissimo supprimé.");
    setForm((prev) => ({ ...prev, colissimoLogin: "", colissimoPassword: "" }));
    setDeleting(false);
  }

  function updateDeliverySetting(
    provider: string,
    field: "deliveryCost" | "returnCost" | "withholdingTaxPercent",
    value: string
  ) {
    const numericValue = value === "" ? 0 : Number(value);
    setDeliverySettings((prev) =>
      prev.map((setting) =>
        setting.provider === provider
          ? { ...setting, [field]: Number.isFinite(numericValue) ? numericValue : 0 }
          : setting
      )
    );
  }

  async function saveDeliverySetting(setting: DeliveryCostSetting) {
    setSavingDeliveryProvider(setting.provider);
    setError("");
    setMessage("");

    const res = await fetch("/api/delivery-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: setting.provider,
        deliveryCost: setting.deliveryCost,
        returnCost: setting.returnCost,
        withholdingTaxPercent: setting.withholdingTaxPercent,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      setError(payload.message || "Erreur modification des couts de livraison.");
      setSavingDeliveryProvider(null);
      return;
    }

    setMessage(`Couts ${DELIVERY_PROVIDER_LABELS[setting.provider] || setting.provider} enregistres.`);
    await loadSettings();
    setSavingDeliveryProvider(null);
  }

  async function handleResetPlatform() {
    if (resetText !== "MISE A ZERO") return;
    if (!window.confirm("Confirmer définitivement la mise à zéro de toutes les données ?")) return;
    
    setResetting(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/settings/reset-platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationText: resetText })
      });
      const data = await res.json();
      if (data.success) {
        setMessage("Plateforme remise à zéro avec succès. Veuillez rafraîchir la page.");
        setConfirmReset(false);
        setResetText("");
      } else {
        setError(data.message || data.error || "Erreur de mise à zéro");
      }
    } catch (e) {
      setError("Erreur réseau");
    }
    setResetting(false);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Settings className="h-7 w-7" />
          Paramètres
        </h1>
        <p className="text-muted-foreground mt-1 text-sm lg:text-base">
          Configuration de la plateforme.
        </p>
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

      <Link
        href="/settings/users"
        className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/20 lg:p-6"
      >
        <span className="flex items-center gap-3">
          <Users className="h-5 w-5" />
          <span>
            <span className="block font-semibold">Utilisateurs</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Valider les comptes, refuser les demandes et gerer les roles.
            </span>
          </span>
        </span>
        <span className="text-sm font-medium text-primary">Ouvrir</span>
      </Link>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-5 lg:p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Général
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Nom de la plateforme</label>
              <input
                type="text"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={form.platformName}
                onChange={(e) => setForm((prev) => ({ ...prev, platformName: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Devise</label>
              <select
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={form.defaultCurrency}
                onChange={(e) => setForm((prev) => ({ ...prev, defaultCurrency: e.target.value }))}
              >
                <option value="DT">DT (Dinar Tunisien)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="USD">USD (Dollar)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Langue</label>
              <select
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={form.defaultLanguage}
                onChange={(e) => setForm((prev) => ({ ...prev, defaultLanguage: e.target.value }))}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 lg:p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Truck className="h-5 w-5" />
            InstaDelivery
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Login API</label>
              <input
                type="text"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder={settings?.hasInstaDelivery ? "***configured***" : "Login InstaDelivery"}
                value={form.instaLogin}
                onChange={(e) => setForm((prev) => ({ ...prev, instaLogin: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Mot de passe API</label>
              <input
                type="password"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder={settings?.hasInstaDelivery ? "Laisser vide pour conserver" : "Mot de passe"}
                value={form.instaPassword}
                onChange={(e) => setForm((prev) => ({ ...prev, instaPassword: e.target.value }))}
              />
            </div>
          </div>
          {settings?.hasInstaDelivery && (
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={testConnection}
                disabled={testing}
                className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 font-medium hover:bg-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <TestTube className="h-4 w-4" />
                {testing ? "Test..." : "Tester connexion"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 lg:p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Colissimo
          </h2>
          {colissimoConfigured ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                Colissimo configuré
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={testColissimoConnection}
                  disabled={testing}
                  className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 font-medium hover:bg-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <TestTube className="h-4 w-4" />
                  {testing ? "Test..." : "Tester connexion"}
                </button>
                <button
                  type="button"
                  onClick={deleteColissimo}
                  className="px-4 py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Utilisateur API</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Utilisateur Colissimo"
                    value={form.colissimoLogin}
                    onChange={(e) => setForm((prev) => ({ ...prev, colissimoLogin: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Mot de passe API</label>
                  <input
                    type="password"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Mot de passe"
                    value={form.colissimoPassword}
                    onChange={(e) => setForm((prev) => ({ ...prev, colissimoPassword: e.target.value }))}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={saveColissimo}
                disabled={loading}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 font-medium hover:bg-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                {loading ? "Enregistrement..." : "Enregistrer Colissimo"}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 lg:p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Couts de livraison
          </h2>
          <div className="space-y-4">
            {deliverySettings.map((setting) => (
              <div
                key={setting.provider}
                className="rounded-lg border border-border bg-background/60 p-4"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {DELIVERY_PROVIDER_LABELS[setting.provider] || setting.provider}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ces valeurs sont appliquees aux prochains imports et synchronisations.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:w-[540px]">
                    <label className="block">
                      <span className="block text-xs font-medium text-muted-foreground mb-1">
                        Cout livraison
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={setting.deliveryCost}
                        onChange={(e) => updateDeliverySetting(setting.provider, "deliveryCost", e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium text-muted-foreground mb-1">
                        Cout retour
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={setting.returnCost}
                        onChange={(e) => updateDeliverySetting(setting.provider, "returnCost", e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium text-muted-foreground mb-1">
                        Retenue a la source (%)
                      </span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={setting.withholdingTaxPercent}
                        onChange={(e) => updateDeliverySetting(setting.provider, "withholdingTaxPercent", e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => saveDeliverySetting(setting)}
                  disabled={savingDeliveryProvider === setting.provider}
                  className={cn(
                    "mt-4 w-full rounded-lg border border-input bg-background px-4 py-2.5 font-medium hover:bg-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2",
                    savingDeliveryProvider === setting.provider && "cursor-wait"
                  )}
                >
                  <Save className="h-4 w-4" />
                  {savingDeliveryProvider === setting.provider ? "Enregistrement..." : "Enregistrer les couts"}
                </button>
              </div>
            ))}
            {deliverySettings.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aucun parametre de livraison disponible.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 lg:p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Package className="h-5 w-5" />
            Stock & Commandes
          </h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.stockSyncEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, stockSyncEnabled: e.target.checked }))}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              Activer la synchronisation automatique stock/commandes
            </label>
            {form.stockSyncEnabled && (
              <div className="pl-7 space-y-2 border-l-2 border-muted">
                <label className="flex items-center gap-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.stockRuleColisEnleve}
                    onChange={(e) => setForm((prev) => ({ ...prev, stockRuleColisEnleve: e.target.checked }))}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  />
                  Colis enlevé → Sortie de stock
                </label>
                <label className="flex items-center gap-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.stockRuleRetourLivre}
                    onChange={(e) => setForm((prev) => ({ ...prev, stockRuleRetourLivre: e.target.checked }))}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  />
                  Colis Retour livré → Entrée en stock
                </label>
                <label className="flex items-center gap-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.stockRuleRetourPlanifie}
                    onChange={(e) => setForm((prev) => ({ ...prev, stockRuleRetourPlanifie: e.target.checked }))}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  />
                  Retour planifié → Stock en attente
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 lg:p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Paiements
          </h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.paymentManualValidation}
                onChange={(e) => setForm((prev) => ({ ...prev, paymentManualValidation: e.target.checked }))}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              Validation manuelle obligatoire avant intégration au CA
            </label>
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.paymentValidatedOnlyRevenue}
                onChange={(e) => setForm((prev) => ({ ...prev, paymentValidatedOnlyRevenue: e.target.checked }))}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              Inclure seulement les paiements validés dans le chiffre d&apos;affaires
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="h-4 w-4" />
          {loading ? "Enregistrement..." : "Enregistrer les paramètres"}
        </button>
      </form>

      {/* ZONE DANGEREUSE */}
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 lg:p-6 mt-8">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2 text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-5 w-5" />
          Zone dangereuse
        </h2>
        <p className="text-sm text-rose-600/80 dark:text-rose-400/80 mb-4">
          Cette action supprimera toutes les données opérationnelles de la plateforme : commandes, paiements, dépenses, revenus, imports et historiques. Cette action est irréversible.
        </p>
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className="rounded-lg bg-rose-600 text-white px-4 py-2.5 font-medium hover:bg-rose-700 transition-colors flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Mise à zéro plateforme
        </button>
      </div>

      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-rose-500/30 bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-rose-600 flex items-center gap-2 mb-4">
              <AlertTriangle className="h-5 w-5" />
              Mise à zéro définitive
            </h3>
            <p className="text-muted-foreground mb-4 text-sm">
              Vous êtes sur le point de <b>supprimer toutes les données opérationnelles</b>.
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside mb-4 space-y-1">
              <li>Toutes les commandes</li>
              <li>Tous les paiements et revenus</li>
              <li>Toutes les dépenses et transactions</li>
              <li>Tous les historiques, tâches et objectifs</li>
              <li>Mise à zéro des stocks et quantités vendues</li>
            </ul>
            <p className="text-sm font-medium mb-2">
              Pour confirmer, tapez exactement : <span className="font-mono bg-muted px-1 rounded text-rose-600">MISE A ZERO</span>
            </p>
            <input
              type="text"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm mb-6"
              placeholder="MISE A ZERO"
            />
            <div className="flex gap-3">
              <button
                onClick={handleResetPlatform}
                disabled={resetText !== "MISE A ZERO" || resetting}
                className="flex-1 rounded-lg bg-rose-600 text-white px-4 py-2.5 font-medium hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {resetting ? "Suppression en cours..." : "Confirmer la mise à zéro"}
              </button>
              <button
                onClick={() => { setConfirmReset(false); setResetText(""); }}
                disabled={resetting}
                className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 font-medium hover:bg-accent flex items-center justify-center gap-2"
              >
                <X className="h-4 w-4" />
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold mb-4">Confirmer la suppression</h3>
            <p className="text-muted-foreground mb-6">
              Supprimer la configuration InstaDelivery ? Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteInsta}
                disabled={deleting}
                className="flex-1 rounded-lg bg-rose-600 text-white px-4 py-2.5 font-medium hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "..." : "Confirmer"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
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
