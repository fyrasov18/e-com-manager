"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Download,
  Edit2,
  FileText,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  DEFAULT_USD_TND_RATE,
  MANUAL_EXPENSE_SOURCE,
  META_ADS_SOURCE,
  calculateAmountTnd,
} from "@/lib/expenses";
import { cn } from "@/lib/utils";
import { permissionsHavePermission, roleHasPermission } from "@/lib/rbac";

type ExpenseType = "RECURRING" | "ONE_TIME";
type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type PeriodFilter = "today" | "month" | "all" | "custom";

type Expense = {
  id: string;
  name: string;
  amount: number;
  type: ExpenseType;
  frequency: Frequency | null;
  startDate: string;
  category: string;
  description: string | null;
  isActive: boolean;
  source: string;
  amountUsd: number | null;
  exchangeRate: number | null;
  amountTnd: number | null;
  createdAt: string;
  createdBy?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

type ExpenseSummary = {
  today: {
    usd: number;
    tnd: number;
  };
  month: {
    usd: number;
    tnd: number;
  };
};

type ExpensesResponse = {
  expenses: Expense[];
  summary: ExpenseSummary;
  defaultExchangeRate: number;
};

type MetaAdsImportResponse = {
  imported: number;
  updated: number;
  skipped: number;
  totalUsd: number;
  totalTnd: number;
  errors: string[];
  expenses: Expense[];
  error?: string;
};

const CATEGORIES = [
  "Abonnements",
  "Outils SaaS",
  "Publicité",
  "Loyer",
  "Services",
  "Logiciels",
  "Frais bancaires",
  "Transport",
  "Autre",
];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "DAILY", label: "Quotidien" },
  { value: "WEEKLY", label: "Hebdomadaire" },
  { value: "MONTHLY", label: "Mensuel" },
  { value: "YEARLY", label: "Annuel" },
];

const EMPTY_SUMMARY: ExpenseSummary = {
  today: { usd: 0, tnd: 0 },
  month: { usd: 0, tnd: 0 },
};

function todayInputValue() {
  return new Date().toISOString().split("T")[0];
}

function formatInputDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayInputValue();
  return date.toISOString().split("T")[0];
}

function parseNumberInput(value: string) {
  const parsed = Number.parseFloat(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatTnd(value: number) {
  return `${value.toFixed(3)} TND`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getExpenseAmountTnd(expense: Expense) {
  return expense.amountTnd ?? expense.amount ?? 0;
}

function getCreatorLabel(expense: Expense) {
  return expense.createdBy?.name || expense.createdBy?.email || "-";
}

function getExpensesFromResponse(data: unknown) {
  if (Array.isArray(data)) return data as Expense[];
  if (data && typeof data === "object" && Array.isArray((data as ExpensesResponse).expenses)) {
    return (data as ExpensesResponse).expenses;
  }
  return [];
}

function isExpensesResponse(data: unknown): data is ExpensesResponse {
  return Boolean(
    data &&
      typeof data === "object" &&
      Array.isArray((data as ExpensesResponse).expenses) &&
      (data as ExpensesResponse).summary
  );
}

export default function ExpensesPage() {
  const { data: session, status } = useSession();
  const canWrite =
    permissionsHavePermission(session?.user?.permissions, "expenses:write") ||
    roleHasPermission(session?.user?.role, "expenses:write");

  const [metaExpenses, setMetaExpenses] = useState<Expense[]>([]);
  const [manualExpenses, setManualExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary>(EMPTY_SUMMARY);
  const [defaultExchangeRate, setDefaultExchangeRate] = useState(DEFAULT_USD_TND_RATE);
  const [metaLoading, setMetaLoading] = useState(true);
  const [manualLoading, setManualLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [importingMeta, setImportingMeta] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [metaImportErrors, setMetaImportErrors] = useState<string[]>([]);

  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [noteSearch, setNoteSearch] = useState("");

  const [rateTouched, setRateTouched] = useState(false);
  const [importRateTouched, setImportRateTouched] = useState(false);
  const [metaImportFile, setMetaImportFile] = useState<File | null>(null);
  const [metaImportInputKey, setMetaImportInputKey] = useState(0);
  const [editingMetaId, setEditingMetaId] = useState<string | null>(null);
  const [metaForm, setMetaForm] = useState({
    date: todayInputValue(),
    amountUsd: "",
    exchangeRate: DEFAULT_USD_TND_RATE.toFixed(2),
    note: "",
  });
  const [metaImportRate, setMetaImportRate] = useState(DEFAULT_USD_TND_RATE.toFixed(2));

  const [manualFilter, setManualFilter] = useState<"ALL" | ExpenseType>("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [showManualModal, setShowManualModal] = useState(false);
  const [editingManualExpense, setEditingManualExpense] = useState<Expense | null>(null);
  const [manualForm, setManualForm] = useState({
    name: "",
    amount: "",
    type: "RECURRING" as ExpenseType,
    frequency: "MONTHLY" as Frequency,
    startDate: todayInputValue(),
    category: "Abonnements",
    description: "",
  });

  const metaPreview = useMemo(() => {
    const amountUsd = parseNumberInput(metaForm.amountUsd);
    const exchangeRate = parseNumberInput(metaForm.exchangeRate);
    return amountUsd > 0 && exchangeRate > 0
      ? calculateAmountTnd(amountUsd, exchangeRate)
      : 0;
  }, [metaForm.amountUsd, metaForm.exchangeRate]);

  const loadMetaExpenses = useCallback(async () => {
    setMetaLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ source: META_ADS_SOURCE });
      if (period !== "custom") {
        params.set("period", period);
      } else {
        if (fromDate) params.set("from", fromDate);
        if (toDate) params.set("to", toDate);
      }
      if (noteSearch.trim()) params.set("search", noteSearch.trim());

      const res = await fetch(`/api/expenses?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Impossible de charger les dépenses Meta Ads.");
        setMetaExpenses([]);
        return;
      }

      setMetaExpenses(getExpensesFromResponse(data));
      if (isExpensesResponse(data)) {
        setSummary(data.summary ?? EMPTY_SUMMARY);
        setDefaultExchangeRate(data.defaultExchangeRate ?? DEFAULT_USD_TND_RATE);

        if (!rateTouched && !editingMetaId) {
          setMetaForm((current) => ({
            ...current,
            exchangeRate: (data.defaultExchangeRate ?? DEFAULT_USD_TND_RATE).toFixed(2),
          }));
        }

        if (!importRateTouched) {
          setMetaImportRate((data.defaultExchangeRate ?? DEFAULT_USD_TND_RATE).toFixed(2));
        }
      }
    } catch (err) {
      console.error("[Expenses] Meta load error:", err);
      setError("Erreur lors du chargement des dépenses Meta Ads.");
      setMetaExpenses([]);
    } finally {
      setMetaLoading(false);
    }
  }, [editingMetaId, fromDate, importRateTouched, noteSearch, period, rateTouched, toDate]);

  const loadManualExpenses = useCallback(async () => {
    setManualLoading(true);

    try {
      const params = new URLSearchParams({ source: MANUAL_EXPENSE_SOURCE });
      const res = await fetch(`/api/expenses?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Impossible de charger les autres dépenses.");
        setManualExpenses([]);
        return;
      }

      setManualExpenses(getExpensesFromResponse(data));
    } catch (err) {
      console.error("[Expenses] Manual load error:", err);
      setError("Erreur lors du chargement des autres dépenses.");
      setManualExpenses([]);
    } finally {
      setManualLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetaExpenses();
  }, [loadMetaExpenses]);

  useEffect(() => {
    loadManualExpenses();
  }, [loadManualExpenses]);

  const manualCategories = useMemo(() => {
    const categories = new Set(manualExpenses.map((expense) => expense.category));
    return ["ALL", ...Array.from(categories)];
  }, [manualExpenses]);

  const filteredManualExpenses = useMemo(() => {
    return manualExpenses.filter((expense) => {
      if (manualFilter !== "ALL" && expense.type !== manualFilter) return false;
      if (categoryFilter !== "ALL" && expense.category !== categoryFilter) return false;
      return true;
    });
  }, [categoryFilter, manualExpenses, manualFilter]);

  const manualStats = useMemo(() => {
    const recurring = filteredManualExpenses.filter((expense) => expense.type === "RECURRING");
    const oneTime = filteredManualExpenses.filter((expense) => expense.type === "ONE_TIME");

    const totalRecurring = recurring.reduce((sum, expense) => sum + expense.amount, 0);
    const monthlyRecurring = recurring.reduce((sum, expense) => {
      switch (expense.frequency) {
        case "DAILY":
          return sum + expense.amount * 30;
        case "WEEKLY":
          return sum + expense.amount * 4;
        case "MONTHLY":
          return sum + expense.amount;
        case "YEARLY":
          return sum + expense.amount / 12;
        default:
          return sum;
      }
    }, 0);
    const totalOneTime = oneTime.reduce((sum, expense) => sum + expense.amount, 0);

    return {
      recurringCount: recurring.length,
      oneTimeCount: oneTime.length,
      totalRecurring,
      monthlyRecurring,
      totalOneTime,
    };
  }, [filteredManualExpenses]);

  function resetMetaForm(keepRate = metaForm.exchangeRate) {
    setEditingMetaId(null);
    setMetaForm({
      date: todayInputValue(),
      amountUsd: "",
      exchangeRate: keepRate || defaultExchangeRate.toFixed(2),
      note: "",
    });
  }

  async function refreshAll() {
    await Promise.all([loadMetaExpenses(), loadManualExpenses()]);
  }

  async function handleMetaSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;

    const amountUsd = parseNumberInput(metaForm.amountUsd);
    const exchangeRate = parseNumberInput(metaForm.exchangeRate);

    setError("");
    setSuccess("");

    if (!metaForm.date) {
      setError("La date est requise.");
      return;
    }

    if (amountUsd <= 0) {
      setError("Le montant USD est requis et doit être supérieur à 0.");
      return;
    }

    if (exchangeRate <= 0) {
      setError("Le taux de change est requis et doit être supérieur à 0.");
      return;
    }

    setSavingMeta(true);

    try {
      const res = await fetch("/api/expenses", {
        method: editingMetaId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingMetaId,
          source: META_ADS_SOURCE,
          date: metaForm.date,
          amountUsd,
          exchangeRate,
          note: metaForm.note,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de l'enregistrement.");
        return;
      }

      setSuccess(editingMetaId ? "Dépense Meta Ads mise à jour." : "Dépense Meta Ads ajoutée.");
      resetMetaForm(exchangeRate.toFixed(2));
      await loadMetaExpenses();
    } catch (err) {
      console.error("[Expenses] Meta save error:", err);
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setSavingMeta(false);
    }
  }

  function editMetaExpense(expense: Expense) {
    setError("");
    setSuccess("");
    setEditingMetaId(expense.id);
    setRateTouched(true);
    setMetaForm({
      date: formatInputDate(expense.startDate),
      amountUsd: expense.amountUsd?.toString() ?? "",
      exchangeRate: expense.exchangeRate?.toString() ?? defaultExchangeRate.toFixed(2),
      note: expense.description ?? "",
    });
  }

  async function deleteMetaExpense(id: string) {
    if (!canWrite || !confirm("Supprimer cette dépense Meta Ads ?")) return;

    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la suppression.");
        return;
      }

      setSuccess("Dépense Meta Ads supprimée.");
      await loadMetaExpenses();
    } catch (err) {
      console.error("[Expenses] Meta delete error:", err);
      setError("Erreur lors de la suppression.");
    }
  }

  async function handleMetaCsvImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;

    const exchangeRate = parseNumberInput(metaImportRate);

    setError("");
    setSuccess("");
    setMetaImportErrors([]);

    if (!metaImportFile) {
      setError("Choisissez un fichier CSV Meta Ads.");
      return;
    }

    if (exchangeRate <= 0) {
      setError("Le taux USD-TND est requis et doit etre superieur a 0.");
      return;
    }

    const formData = new FormData();
    formData.append("file", metaImportFile);
    formData.append("exchangeRate", exchangeRate.toString());

    setImportingMeta(true);

    try {
      const res = await fetch("/api/expenses/meta-ads/import", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as MetaAdsImportResponse;

      if (!res.ok) {
        setError(data.error || "Erreur lors de l'import CSV Meta Ads.");
        setMetaImportErrors(data.errors ?? []);
        return;
      }

      setSuccess(
        `Import Meta Ads termine: ${data.imported} jour(s) ajoute(s), ${data.updated} mis a jour, ${data.skipped} ligne(s) ignoree(s). Total ${formatUsd(data.totalUsd)} / ${formatTnd(data.totalTnd)}.`
      );
      setMetaImportErrors(data.errors ?? []);
      setMetaImportFile(null);
      setMetaImportInputKey((key) => key + 1);
      setPeriod("all");
      await loadMetaExpenses();
    } catch (err) {
      console.error("[Expenses] Meta CSV import error:", err);
      setError("Erreur lors de l'import CSV Meta Ads.");
    } finally {
      setImportingMeta(false);
    }
  }

  function exportMetaCsv() {
    if (!metaExpenses.length) return;

    const rows = [
      ["Date", "Source", "Montant USD", "Taux USD-TND", "Montant TND", "Note", "Créé par"],
      ...metaExpenses.map((expense) => [
        formatDate(expense.startDate),
        "Meta Ads",
        (expense.amountUsd ?? 0).toFixed(2),
        (expense.exchangeRate ?? 0).toString(),
        getExpenseAmountTnd(expense).toFixed(3),
        expense.description ?? "",
        getCreatorLabel(expense),
      ]),
    ];

    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "depenses-meta-ads.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function openManualModal(expense?: Expense) {
    setError("");
    setSuccess("");
    setEditingManualExpense(expense ?? null);

    if (expense) {
      setManualForm({
        name: expense.name,
        amount: expense.amount.toString(),
        type: expense.type,
        frequency: expense.frequency ?? "MONTHLY",
        startDate: formatInputDate(expense.startDate),
        category: expense.category,
        description: expense.description ?? "",
      });
    } else {
      setManualForm({
        name: "",
        amount: "",
        type: "RECURRING",
        frequency: "MONTHLY",
        startDate: todayInputValue(),
        category: "Abonnements",
        description: "",
      });
    }

    setShowManualModal(true);
  }

  async function handleManualSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;

    setError("");
    setSuccess("");

    if (!manualForm.name.trim()) {
      setError("Le nom est requis.");
      return;
    }

    if (parseNumberInput(manualForm.amount) <= 0) {
      setError("Le montant doit être supérieur à 0.");
      return;
    }

    try {
      const res = await fetch("/api/expenses", {
        method: editingManualExpense ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...manualForm,
          id: editingManualExpense?.id,
          source: MANUAL_EXPENSE_SOURCE,
          amount: parseNumberInput(manualForm.amount),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de l'enregistrement.");
        return;
      }

      setSuccess(editingManualExpense ? "Dépense mise à jour." : "Dépense ajoutée.");
      setShowManualModal(false);
      await loadManualExpenses();
    } catch (err) {
      console.error("[Expenses] Manual save error:", err);
      setError("Erreur lors de l'enregistrement.");
    }
  }

  async function deleteManualExpense(id: string) {
    if (!canWrite || !confirm("Voulez-vous supprimer cette dépense ?")) return;

    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la suppression.");
        return;
      }

      setSuccess("Dépense supprimée.");
      await loadManualExpenses();
    } catch (err) {
      console.error("[Expenses] Manual delete error:", err);
      setError("Erreur lors de la suppression.");
    }
  }

  async function toggleManualActive(expense: Expense) {
    if (!canWrite) return;

    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: expense.id, isActive: !expense.isActive }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la mise à jour.");
        return;
      }

      await loadManualExpenses();
    } catch (err) {
      console.error("[Expenses] Manual toggle error:", err);
      setError("Erreur lors de la mise à jour.");
    }
  }

  const readonlyMessage =
    status === "loading"
      ? "Chargement des permissions..."
      : "Votre rôle permet de consulter les dépenses, mais pas de les modifier.";

  return (
    <div className="space-y-7 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold lg:text-3xl">Dépenses</h1>
          <p className="mt-1 text-sm text-muted-foreground lg:text-base">
            Pilotez les dépenses publicitaires en USD et les frais opérationnels en TND.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={metaLoading || manualLoading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", (metaLoading || manualLoading) && "animate-spin")} />
          Actualiser
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Calendar}
          label="Dépenses Meta Ads aujourd’hui — USD"
          value={formatUsd(summary.today.usd)}
          tone="text-sky-400"
        />
        <KpiCard
          icon={Megaphone}
          label="Dépenses Meta Ads aujourd’hui — TND"
          value={formatTnd(summary.today.tnd)}
          tone="text-emerald-400"
        />
        <KpiCard
          icon={Calendar}
          label="Dépenses Meta Ads ce mois — USD"
          value={formatUsd(summary.month.usd)}
          tone="text-violet-400"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Dépenses Meta Ads ce mois — TND"
          value={formatTnd(summary.month.tnd)}
          tone="text-amber-400"
        />
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Dépenses journalières Meta Ads</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Suivez vos dépenses publicitaires Meta Ads en USD avec conversion automatique en TND.
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            Taux par défaut: <span className="font-mono text-foreground">{defaultExchangeRate.toFixed(2)}</span>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
          <div className="space-y-4">
            <form
              onSubmit={handleMetaSubmit}
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
            >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {editingMetaId ? "Modifier la dépense" : "Ajouter une dépense"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Le montant en TND est calculé automatiquement selon le taux choisi.
                </p>
              </div>
              {editingMetaId && (
                <button
                  type="button"
                  onClick={() => resetMetaForm()}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Annuler la modification"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {!canWrite && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                {readonlyMessage}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Date</label>
                <input
                  type="date"
                  value={metaForm.date}
                  onChange={(event) =>
                    setMetaForm((current) => ({ ...current, date: event.target.value }))
                  }
                  disabled={!canWrite}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Montant en USD</label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={metaForm.amountUsd}
                    onChange={(event) =>
                      setMetaForm((current) => ({ ...current, amountUsd: event.target.value }))
                    }
                    disabled={!canWrite}
                    className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Taux USD → TND</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={metaForm.exchangeRate}
                  onChange={(event) => {
                    setRateTouched(true);
                    setMetaForm((current) => ({
                      ...current,
                      exchangeRate: event.target.value,
                    }));
                  }}
                  disabled={!canWrite}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="3.100"
                  required
                />
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3">
                <p className="text-xs font-medium text-primary">Montant calculé en TND</p>
                <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                  {formatTnd(metaPreview)}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Note optionnelle</label>
                <textarea
                  value={metaForm.note}
                  onChange={(event) =>
                    setMetaForm((current) => ({ ...current, note: event.target.value }))
                  }
                  disabled={!canWrite}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Campagne, audience, objectif..."
                />
              </div>

              <button
                type="submit"
                disabled={!canWrite || savingMeta}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingMeta ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingMetaId ? "Mettre à jour" : "Ajouter la dépense"}
              </button>
            </div>
            </form>

            <form
              onSubmit={handleMetaCsvImport}
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
            >
              <div className="mb-5">
                <h3 className="font-semibold">Importer CSV Meta Ads</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Export Ads Manager avec paiements factures, regroupe par date.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Fichier CSV</label>
                  <input
                    key={metaImportInputKey}
                    type="file"
                    accept=".csv,text/csv"
                    disabled={!canWrite || importingMeta}
                    onChange={(event) => setMetaImportFile(event.target.files?.[0] ?? null)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">Taux USD-TND</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={metaImportRate}
                    onChange={(event) => {
                      setImportRateTouched(true);
                      setMetaImportRate(event.target.value);
                    }}
                    disabled={!canWrite || importingMeta}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="3.100"
                    required
                  />
                </div>

                {metaImportErrors.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                    <p className="mb-1 font-medium">Lignes ignorees</p>
                    <ul className="space-y-1">
                      {metaImportErrors.slice(0, 4).map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canWrite || importingMeta}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importingMeta ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Importer le CSV
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "today", label: "Aujourd’hui" },
                    { value: "month", label: "Ce mois" },
                    { value: "all", label: "Tous" },
                    { value: "custom", label: "Personnalisé" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setPeriod(item.value as PeriodFilter)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                        period === item.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={noteSearch}
                      onChange={(event) => setNoteSearch(event.target.value)}
                      className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary sm:w-56"
                      placeholder="Rechercher une note"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={exportMetaCsv}
                    disabled={!metaExpenses.length}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    CSV
                  </button>
                </div>
              </div>

              {period === "custom" && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <input
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Source/Type</th>
                    <th className="px-4 py-3 font-medium">Montant USD</th>
                    <th className="px-4 py-3 font-medium">Taux</th>
                    <th className="px-4 py-3 font-medium">Montant TND</th>
                    <th className="px-4 py-3 font-medium">Note</th>
                    <th className="px-4 py-3 font-medium">Créé par</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {metaLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                        <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
                        Chargement des dépenses Meta Ads...
                      </td>
                    </tr>
                  ) : metaExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <Megaphone className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                        <p className="font-medium">Aucune dépense Meta Ads enregistrée pour le moment.</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Ajoutez une dépense journalière pour suivre le budget publicitaire.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    metaExpenses.map((expense) => (
                      <tr key={expense.id} className="border-b border-border/70 last:border-0">
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(expense.startDate)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300">
                            <Megaphone className="h-3.5 w-3.5" />
                            Meta Ads
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">{formatUsd(expense.amountUsd ?? 0)}</td>
                        <td className="px-4 py-3 font-mono">{expense.exchangeRate?.toFixed(3) ?? "-"}</td>
                        <td className="px-4 py-3 font-mono font-semibold text-emerald-400">
                          {formatTnd(getExpenseAmountTnd(expense))}
                        </td>
                        <td className="max-w-[220px] px-4 py-3 text-muted-foreground">
                          <span className="line-clamp-2">{expense.description || "-"}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{getCreatorLabel(expense)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {canWrite ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => editMetaExpense(expense)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteMetaExpense(expense.id)}
                                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">Lecture seule</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Autres dépenses</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Les dépenses historiques en TND restent disponibles pour la finance générale.
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => openManualModal()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Ajouter une dépense générale
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={RefreshCw}
            label="Récurrentes"
            value={formatTnd(manualStats.totalRecurring)}
            helper={`${manualStats.recurringCount} entrée(s)`}
            tone="text-amber-400"
          />
          <KpiCard
            icon={Calendar}
            label="Mensuel estimé"
            value={formatTnd(manualStats.monthlyRecurring)}
            tone="text-sky-400"
          />
          <KpiCard
            icon={AlertCircle}
            label="Ponctuelles"
            value={formatTnd(manualStats.totalOneTime)}
            helper={`${manualStats.oneTimeCount} entrée(s)`}
            tone="text-rose-400"
          />
          <KpiCard
            icon={FileText}
            label="Total affiché"
            value={formatTnd(manualStats.totalRecurring + manualStats.totalOneTime)}
            tone="text-emerald-400"
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                { value: "ALL", label: "Toutes" },
                { value: "RECURRING", label: "Récurrentes" },
                { value: "ONE_TIME", label: "Ponctuelles" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setManualFilter(item.value as "ALL" | ExpenseType)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    manualFilter === item.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {manualCategories.map((category) => (
                  <option key={category} value={category}>
                    {category === "ALL" ? "Toutes catégories" : category}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {manualLoading ? (
            <div className="py-10 text-center text-muted-foreground">
              <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
              Chargement des dépenses...
            </div>
          ) : filteredManualExpenses.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <FileText className="mx-auto mb-3 h-8 w-8" />
              Aucune dépense générale trouvée.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredManualExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center",
                    !expense.isActive && "opacity-50"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{expense.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {expense.type === "RECURRING"
                        ? `${FREQUENCIES.find((frequency) => frequency.value === expense.frequency)?.label || expense.frequency} · `
                        : ""}
                      {formatDate(expense.startDate)}
                      {expense.description ? ` · ${expense.description}` : ""}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground sm:w-32">{expense.category}</div>
                  <div className="font-mono text-sm font-semibold text-rose-400 sm:w-32">
                    {formatTnd(expense.amount)}
                  </div>
                  {canWrite && (
                    <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => toggleManualActive(expense)}
                        className={cn(
                          "rounded-lg px-2.5 py-1.5 text-xs font-medium",
                          expense.isActive
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {expense.isActive ? "Actif" : "Inactif"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openManualModal(expense)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteManualExpense(expense.id)}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingManualExpense ? "Modifier la dépense" : "Ajouter une dépense"}
              </h2>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Nom</label>
                <input
                  type="text"
                  value={manualForm.name}
                  onChange={(event) =>
                    setManualForm((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Nom de la dépense"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Montant (TND)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={manualForm.amount}
                    onChange={(event) =>
                      setManualForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="0.000"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Date</label>
                  <input
                    type="date"
                    value={manualForm.startDate}
                    onChange={(event) =>
                      setManualForm((current) => ({ ...current, startDate: event.target.value }))
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualForm((current) => ({ ...current, type: "RECURRING" }))}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      manualForm.type === "RECURRING"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Récurrente
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualForm((current) => ({ ...current, type: "ONE_TIME" }))}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      manualForm.type === "ONE_TIME"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Ponctuelle
                  </button>
                </div>
              </div>

              {manualForm.type === "RECURRING" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Fréquence</label>
                  <select
                    value={manualForm.frequency}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        frequency: event.target.value as Frequency,
                      }))
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    {FREQUENCIES.map((frequency) => (
                      <option key={frequency.value} value={frequency.value}>
                        {frequency.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium">Catégorie</label>
                <select
                  value={manualForm.category}
                  onChange={(event) =>
                    setManualForm((current) => ({ ...current, category: event.target.value }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Description</label>
                <textarea
                  value={manualForm.description}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  rows={2}
                  placeholder="Détails supplémentaires..."
                />
              </div>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                {editingManualExpense ? "Mettre à jour" : "Ajouter"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper?: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className={cn("h-5 w-5 flex-shrink-0", tone)} />
      </div>
      <p className={cn("font-mono text-2xl font-bold", tone)}>{value}</p>
      {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}
