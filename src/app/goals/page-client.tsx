"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Target,
  Plus,
  CheckCircle,
  AlertCircle,
  Pencil,
  Trash2,
  RefreshCw,
  X,
  CalendarDays,
  DollarSign,
  BarChart3,
  PieChart,
} from "lucide-react";

type GoalType = "REVENUE" | "ORDERS" | "PROFIT" | "EXPENSES" | "STOCK" | "DELIVERY" | "CUSTOM";
type GoalPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";
type GoalStatus = "ON_TRACK" | "BEHIND" | "AHEAD" | "ACHIEVED";

type Goal = {
  id: string;
  title: string;
  type: GoalType;
  period: GoalPeriod;
  targetValue: number;
  currentValue: number;
  status: GoalStatus;
  progress: number;
  description?: string | null;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  detail: Record<string, number | string>;
};

type GoalForm = {
  title: string;
  type: GoalType;
  period: GoalPeriod;
  targetValue: string;
  startDate: string;
  endDate: string;
  description: string;
};

const TYPE_LABELS: Record<GoalType, string> = {
  REVENUE: "Chiffre d'affaires",
  ORDERS: "Commandes",
  PROFIT: "Bénéfice",
  EXPENSES: "Dépenses",
  STOCK: "Stock",
  DELIVERY: "Livraison",
  CUSTOM: "Personnalisé",
};

const PERIOD_LABELS: Record<GoalPeriod, string> = {
  DAILY: "Quotidien",
  WEEKLY: "Hebdomadaire",
  MONTHLY: "Mensuel",
  YEARLY: "Annuel",
  CUSTOM: "Personnalisé",
};

const STATUS_LABELS: Record<GoalStatus, { label: string; color: string }> = {
  ON_TRACK: { label: "En bonne voie", color: "bg-amber-500/10 text-amber-500" },
  BEHIND: { label: "En retard", color: "bg-rose-500/10 text-rose-500" },
  AHEAD: { label: "En avance", color: "bg-sky-500/10 text-sky-500" },
  ACHIEVED: { label: "Atteint", color: "bg-emerald-500/10 text-emerald-500" },
};

function formatValue(type: GoalType, value: number) {
  if (type === "REVENUE" || type === "PROFIT" || type === "EXPENSES") {
    return `${value.toFixed(2)} DT`;
  }
  if (type === "DELIVERY") {
    return `${value.toFixed(1)} %`;
  }
  return value.toFixed(0);
}

function goalUnit(type: GoalType) {
  if (type === "REVENUE" || type === "PROFIT" || type === "EXPENSES") return "DT";
  if (type === "DELIVERY") return "%";
  return "unités";
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: "", status: "", period: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState<GoalForm>({
    title: "",
    type: "REVENUE",
    period: "MONTHLY",
    targetValue: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    description: "",
  });

  const loadGoals = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/goals");
      const data = await res.json();
      setGoals(data.goals || []);
    } catch (err) {
      setError("Impossible de charger les objectifs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const filteredGoals = useMemo(
    () =>
      goals.filter((goal) => {
        return (
          (!filters.type || goal.type === filters.type) &&
          (!filters.status || goal.status === filters.status) &&
          (!filters.period || goal.period === filters.period)
        );
      }),
    [goals, filters]
  );

  const summary = useMemo(() => {
    const total = goals.length;
    const achieved = goals.filter((goal) => goal.status === "ACHIEVED").length;
    const behind = goals.filter((goal) => goal.status === "BEHIND").length;
    const active = total - achieved;
    const avgProgress = total ? goals.reduce((sum, goal) => sum + goal.progress, 0) / total : 0;
    return { total, achieved, behind, active, avgProgress };
  }, [goals]);

  const flash = (msg: string, isError = false) => {
    if (isError) setError(msg); else setMessage(msg);
    window.setTimeout(() => { setError(""); setMessage(""); }, 5000);
  };

  const openCreateModal = () => {
    setFieldErrors({});
    setEditGoal(null);
    setForm({
      title: "",
      type: "REVENUE",
      period: "MONTHLY",
      targetValue: "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      description: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (goal: Goal) => {
    setFieldErrors({});
    setEditGoal(goal);
    setForm({
      title: goal.title,
      type: goal.type,
      period: goal.period,
      targetValue: String(goal.targetValue),
      startDate: goal.startDate.slice(0, 10),
      endDate: goal.endDate.slice(0, 10),
      description: goal.description ?? "",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    setFieldErrors({});
    const targetValue = parseFloat(form.targetValue);
    const errors: Record<string, string> = {};

    if (!form.title.trim()) {
      errors.title = "Veuillez renseigner le titre.";
    }

    if (Number.isNaN(targetValue) || targetValue < 0) {
      errors.targetValue = "Veuillez renseigner une valeur cible valide.";
    }

    if (!form.period) {
      errors.period = "Veuillez sélectionner une période.";
    }

    if (form.period === "CUSTOM") {
      if (!form.startDate) {
        errors.startDate = "Veuillez renseigner la date de début.";
      }
      if (!form.endDate) {
        errors.endDate = "Veuillez renseigner la date de fin.";
      }
      if (form.startDate && form.endDate && new Date(form.startDate) > new Date(form.endDate)) {
        errors.endDate = "La date de fin doit être postérieure à la date de début.";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      flash("Impossible de créer l'objectif. Vérifiez les champs et réessayez.", true);
      return;
    }

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.type,
      period: form.period,
      targetValue,
    };

    if (form.period === "CUSTOM") {
      payload.startDate = form.startDate;
      payload.endDate = form.endDate;
    }

    if (form.description.trim()) {
      payload.description = form.description.trim();
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/goals", {
        method: editGoal ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editGoal ? { id: editGoal.id, ...payload } : payload),
      });
      const data = await res.json();
      if (res.ok) {
        flash(editGoal ? "Objectif modifié." : "Objectif créé.");
        setIsModalOpen(false);
        await loadGoals();
      } else {
        flash(data.error || "Impossible de créer l'objectif. Vérifiez les champs et réessayez.", true);
      }
    } catch (err) {
      flash("Erreur réseau lors de l'enregistrement.", true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (goal: Goal) => {
    if (!window.confirm(`Supprimer l'objectif « ${goal.title} » ?`)) return;
    try {
      const res = await fetch(`/api/goals?id=${goal.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.success) {
        flash("Objectif supprimé.");
        await loadGoals();
      } else {
        flash(data.error || "Erreur de suppression.", true);
      }
    } catch (err) {
      flash("Erreur réseau lors de la suppression.", true);
    }
  };

  const handleMarkComplete = async (goal: Goal) => {
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goal.id, action: "markAchieved" }),
      });
      const data = await res.json();
      if (res.ok) {
        flash("Objectif marqué comme atteint.");
        await loadGoals();
      } else {
        flash(data.error || "Erreur lors de la mise a jour.", true);
      }
    } catch (err) {
      flash("Erreur réseau lors de la mise a jour.", true);
    }
  };

  const handleReset = async (goal: Goal) => {
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goal.id, action: "reset", period: goal.period }),
      });
      const data = await res.json();
      if (res.ok) {
        flash("Objectif réinitialisé.");
        await loadGoals();
      } else {
        flash(data.error || "Erreur lors de la réinitialisation.", true);
      }
    } catch (err) {
      flash("Erreur réseau lors de la réinitialisation.", true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Target className="h-7 w-7 text-primary" /> Objectifs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Définissez, suivez et analysez vos objectifs business avec des données réelles.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Créer un objectif
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Objectifs actifs" value={`${summary.active}`} icon={<BarChart3 className="h-4 w-4" />} />
        <StatCard label="Objectifs atteints" value={`${summary.achieved}`} icon={<CheckCircle className="h-4 w-4" />} />
        <StatCard label="En retard" value={`${summary.behind}`} icon={<AlertCircle className="h-4 w-4" />} />
        <StatCard label="Progression moyenne" value={`${(summary.avgProgress * 100).toFixed(0)} %`} icon={<PieChart className="h-4 w-4" />} />
      </div>

      {error && <Alert type="error" msg={error} />}
      {message && <Alert type="success" msg={message} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-4">
            <CalendarDays className="h-4 w-4" /> Filtres
          </div>
          <div className="space-y-3">
            <SelectField label="Type" value={filters.type} onChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}>
              <option value="">Tous les types</option>
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </SelectField>
            <SelectField label="Période" value={filters.period} onChange={(value) => setFilters((prev) => ({ ...prev, period: value }))}>
              <option value="">Toutes</option>
              {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </SelectField>
            <SelectField label="Statut" value={filters.status} onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}>
              <option value="">Tous</option>
              {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </SelectField>
            {(filters.type || filters.period || filters.status) && (
              <button
                onClick={() => setFilters({ type: "", period: "", status: "" })}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        </div>

        <div className="xl:col-span-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold mb-3">Résumé des objectifs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MetricCard label="Objectifs totaux" value={`${summary.total}`} />
            <MetricCard label="Progrès moyen" value={`${(summary.avgProgress * 100).toFixed(0)} %`} />
            <MetricCard label="Objectifs atteints" value={`${summary.achieved}`} />
            <MetricCard label="Objectifs en retard" value={`${summary.behind}`} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Chargement des objectifs...</div>
        ) : filteredGoals.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            Aucun objectif trouvé. Créez un objectif pour commencer.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filteredGoals.map((goal) => {
              const status = STATUS_LABELS[goal.status] ?? { label: goal.status, color: "bg-muted text-muted-foreground" };
              return (
                <div key={goal.id} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground mb-2">{TYPE_LABELS[goal.type]}</div>
                      <h3 className="text-xl font-semibold">{goal.title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{goal.description ?? "Objectif métier"}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                    <div>
                      <div className="text-2xl font-semibold text-foreground">{formatValue(goal.type, goal.currentValue)}</div>
                      <div>Actuel</div>
                    </div>
                    <div>
                      <div className="text-2xl font-semibold text-foreground">{formatValue(goal.type, goal.targetValue)}</div>
                      <div>Objectif</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Progression</div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div className="h-3 rounded-full bg-primary" style={{ width: `${Math.round(goal.progress * 100)}%` }} />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">{Math.round(goal.progress * 100)} %</div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <InfoTile label="Période" value={PERIOD_LABELS[goal.period]} />
                    <InfoTile label="Début" value={new Date(goal.startDate).toLocaleDateString("fr-FR")} />
                    <InfoTile label="Fin" value={new Date(goal.endDate).toLocaleDateString("fr-FR")} />
                    <InfoTile label="Métrique" value={goalUnit(goal.type)} />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      onClick={() => openEditModal(goal)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Modifier
                    </button>
                    <button
                      onClick={() => handleMarkComplete(goal)}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      <CheckCircle className="h-3.5 w-3.5" /> Atteint
                    </button>
                    <button
                      onClick={() => handleReset(goal)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Réinitialiser
                    </button>
                    <button
                      onClick={() => handleDelete(goal)}
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-semibold">{editGoal ? "Modifier l'objectif" : "Créer un nouvel objectif"}</h2>
                <p className="text-sm text-muted-foreground">Établissez vos objectifs et suivez les résultats en temps réel.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Titre">
                <input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="input-base"
                  placeholder="Ex: Objectif CA mensuel"
                />
                {fieldErrors.title && <p className="mt-1 text-xs text-rose-500">{fieldErrors.title}</p>}
              </Field>
              <Field label="Type">
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as GoalType }))}
                  className="input-base"
                >
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Période">
                <select
                  value={form.period}
                  onChange={(e) => setForm((prev) => ({ ...prev, period: e.target.value as GoalPeriod }))}
                  className="input-base"
                >
                  {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                {fieldErrors.period && <p className="mt-1 text-xs text-rose-500">{fieldErrors.period}</p>}
              </Field>
              <Field label="Valeur cible">
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.targetValue}
                    onChange={(e) => setForm((prev) => ({ ...prev, targetValue: e.target.value }))}
                    className="input-base flex-1"
                    placeholder={`Ex: 10000 ${goalUnit(form.type)}`}
                  />
                  <span className="inline-flex items-center rounded-lg border border-border px-3 text-sm text-muted-foreground">
                    {goalUnit(form.type)}
                  </span>
                </div>
                {fieldErrors.targetValue && <p className="mt-1 text-xs text-rose-500">{fieldErrors.targetValue}</p>}
              </Field>
            </div>

            {form.period === "CUSTOM" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date de début">
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="input-base"
                  />
                  {fieldErrors.startDate && <p className="mt-1 text-xs text-rose-500">{fieldErrors.startDate}</p>}
                </Field>
                <Field label="Date de fin">
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                    className="input-base"
                  />
                  {fieldErrors.endDate && <p className="mt-1 text-xs text-rose-500">{fieldErrors.endDate}</p>}
                </Field>
              </div>
            )}

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="input-base min-h-[120px]"
                placeholder="Détaillez l'objectif pour le rendre plus concret."
              />
            </Field>

            <div className="mt-6 flex flex-wrap gap-3 justify-end">
              <button onClick={() => { setIsModalOpen(false); setFieldErrors({}); }} className="rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted">
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className={`rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 ${isSubmitting ? "cursor-not-allowed opacity-70" : ""}`}
              >
                {isSubmitting ? "En cours..." : editGoal ? "Enregistrer" : "Créer l'objectif"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">{icon}{label}</div>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-border bg-background p-4">
      <p className="text-sm text-muted-foreground mb-2">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-base mt-2 w-full">
        {children}
      </select>
    </label>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/50 p-3 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-2">{label}</label>
      {children}
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
