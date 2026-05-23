"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { CheckSquare, Plus, Bell, BellOff, Trash2, Edit2, Check, Clock, AlertTriangle, RefreshCw, X, ChevronDown, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────
type Priority = "LOW" | "MEDIUM" | "HIGH";
type Status = "TODO" | "IN_PROGRESS" | "DONE";
type Repeat = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
type Category = "ORDERS" | "DELIVERY" | "STOCK" | "PAYMENT" | "EXPENSES" | "MARKETING" | "OTHER";

interface Task {
  id: string; title: string; description?: string; category: Category;
  priority: Priority; status: Status; dueDate?: string; reminderAt?: string;
  repeat: Repeat; reminderEnabled: boolean; completedAt?: string; createdAt: string;
}
interface Stats { today: number; done: number; overdue: number; reminders: number; }

// ── Constants ──────────────────────────────────────────────────────────
const PRIORITY_CFG = {
  LOW:    { label: "Basse",   cls: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  MEDIUM: { label: "Moyenne", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  HIGH:   { label: "Haute",   cls: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
};
const STATUS_CFG = {
  TODO:        { label: "À faire",   cls: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  IN_PROGRESS: { label: "En cours",  cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  DONE:        { label: "Terminée",  cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};
const CATEGORY_CFG: Record<Category, { label: string; emoji: string }> = {
  ORDERS:    { label: "Commandes",  emoji: "🛒" },
  DELIVERY:  { label: "Livraison",  emoji: "🚚" },
  STOCK:     { label: "Stock",      emoji: "📦" },
  PAYMENT:   { label: "Paiement",   emoji: "💳" },
  EXPENSES:  { label: "Dépenses",   emoji: "💰" },
  MARKETING: { label: "Marketing",  emoji: "📣" },
  OTHER:     { label: "Autre",      emoji: "📌" },
};
const REPEAT_CFG: Record<Repeat, string> = { NONE: "Aucune", DAILY: "Quotidienne", WEEKLY: "Hebdomadaire", MONTHLY: "Mensuelle" };

const SUGGESTIONS = [
  { title: "Vérifier les nouvelles commandes", category: "ORDERS" as Category, priority: "HIGH" as Priority },
  { title: "Synchroniser statuts livraison", category: "DELIVERY" as Category, priority: "HIGH" as Priority },
  { title: "Vérifier les paiements reçus", category: "PAYMENT" as Category, priority: "HIGH" as Priority },
  { title: "Valider les paiements reçus", category: "PAYMENT" as Category, priority: "MEDIUM" as Priority },
  { title: "Vérifier stock faible", category: "STOCK" as Category, priority: "MEDIUM" as Priority },
  { title: "Ajouter les dépenses du jour", category: "EXPENSES" as Category, priority: "LOW" as Priority },
  { title: "Consulter les retours livraison", category: "DELIVERY" as Category, priority: "MEDIUM" as Priority },
];

// ── Toast ──────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: "ok" | "err" }[]>([]);
  const add = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, add };
}

// ── Form modal ─────────────────────────────────────────────────────────
const BLANK = { title: "", description: "", category: "OTHER" as Category, priority: "MEDIUM" as Priority, status: "TODO" as Status, dueDate: "", reminderAt: "", repeat: "NONE" as Repeat, reminderEnabled: true };

function TaskModal({ task, onClose, onSave }: { task?: Partial<Task>; onClose: () => void; onSave: (data: any) => Promise<void> }) {
  const [form, setForm] = useState({ ...BLANK, ...task, dueDate: task?.dueDate ? task.dueDate.slice(0, 16) : "", reminderAt: task?.reminderAt ? task.reminderAt.slice(0, 16) : "" });
  const [saving, setSaving] = useState(false);
  const s = (k: string) => (v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold">{task?.id ? "Modifier la tâche" : "Nouvelle tâche"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Titre *</label>
            <input value={form.title} onChange={e => s("title")(e.target.value)} placeholder="Ex: Vérifier les commandes" className="input-base" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <textarea value={form.description} onChange={e => s("description")(e.target.value)} rows={2} className="input-base resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Catégorie</label>
              <select value={form.category} onChange={e => s("category")(e.target.value)} className="input-base">
                {Object.entries(CATEGORY_CFG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Priorité</label>
              <select value={form.priority} onChange={e => s("priority")(e.target.value)} className="input-base">
                {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date échéance</label>
              <input type="datetime-local" value={form.dueDate} onChange={e => s("dueDate")(e.target.value)} className="input-base" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Rappel à</label>
              <input type="datetime-local" value={form.reminderAt} onChange={e => s("reminderAt")(e.target.value)} className="input-base" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Répétition</label>
              <select value={form.repeat} onChange={e => s("repeat")(e.target.value)} className="input-base">
                {Object.entries(REPEAT_CFG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Statut</label>
              <select value={form.status} onChange={e => s("status")(e.target.value)} className="input-base">
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div onClick={() => s("reminderEnabled")(!form.reminderEnabled)} className={cn("w-10 h-5 rounded-full transition-colors relative", form.reminderEnabled ? "bg-primary" : "bg-muted")}>
              <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", form.reminderEnabled ? "translate-x-5" : "translate-x-0.5")} />
            </div>
            <span className="text-sm">Activer les rappels</span>
          </label>
        </div>
        <div className="flex gap-3 p-5 border-t border-border">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button disabled={saving || !form.title.trim()} onClick={async () => { setSaving(true); await onSave(form); setSaving(false); }}
            className="btn-primary flex-1 disabled:opacity-50">
            {saving ? "Enregistrement..." : task?.id ? "Modifier" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats>({ today: 0, done: 0, overdue: 0, reminders: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [prioFilter, setPrioFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | undefined>();
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>("default");
  const { toasts, add: toast } = useToast();
  const sentReminders = useRef(new Set<string>());

  // Notification permission
  useEffect(() => {
    if ("Notification" in window) setNotifPerm(Notification.permission);
  }, []);

  const requestNotif = async () => {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  };

  // Load tasks
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);
      if (catFilter !== "all") params.set("category", catFilter);
      if (prioFilter !== "all") params.set("priority", prioFilter);
      const res = await fetch(`/api/tasks?${params}`);
      const data = await res.json();
      setTasks(data.tasks ?? []);
      setStats(data.stats ?? { today: 0, done: 0, overdue: 0, reminders: 0 });
    } finally { setLoading(false); }
  }, [filter, catFilter, prioFilter]);

  useEffect(() => { load(); }, [load]);

  // Reminder polling
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/tasks/reminders");
        const data = await res.json();
        for (const t of data.reminders ?? []) {
          if (sentReminders.current.has(t.id)) continue;
          sentReminders.current.add(t.id);
          if (notifPerm === "granted") {
            new Notification(`⏰ Rappel : ${t.title}`, { body: t.description || "Tâche à effectuer", icon: "/favicon.ico" });
          } else {
            toast(`⏰ Rappel : ${t.title}`, "ok");
          }
        }
      } catch {}
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [notifPerm, toast]);

  // CRUD
  const createTask = async (data: any) => {
    const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) { toast("Tâche créée ✓"); setShowModal(false); load(); }
    else { const d = await res.json(); toast(d.error || "Erreur", "err"); }
  };

  const updateTask = async (id: string, data: any) => {
    const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) { toast("Tâche modifiée ✓"); setEditTask(undefined); load(); }
    else { const d = await res.json(); toast(d.error || "Erreur", "err"); }
  };

  const completeTask = async (id: string) => {
    const res = await fetch(`/api/tasks/${id}/complete`, { method: "POST" });
    if (res.ok) { toast("Tâche terminée ✓"); load(); }
    else toast("Erreur", "err");
  };

  const deleteTask = async (id: string) => {
    if (!confirm("Supprimer cette tâche ?")) return;
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) { toast("Tâche supprimée"); load(); }
    else toast("Erreur", "err");
  };

  const toggleReminder = async (task: Task) => {
    await updateTask(task.id, { reminderEnabled: !task.reminderEnabled });
  };

  const addSuggestion = async (s: typeof SUGGESTIONS[0]) => {
    const today = new Date(); today.setHours(18, 0, 0, 0);
    await createTask({ title: s.title, category: s.category, priority: s.priority, dueDate: today.toISOString(), repeat: "NONE", reminderEnabled: true });
  };

  const isOverdue = (t: Task) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "DONE";
  const isToday = (t: Task) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate); const n = new Date();
    return d.toDateString() === n.toDateString();
  };

  const FILTERS = [
    { k: "all", label: "Toutes" }, { k: "today", label: "Aujourd'hui" }, { k: "overdue", label: "En retard" },
    { k: "pending", label: "Non terminées" }, { k: "done", label: "Terminées" },
  ];

  return (
    <div className="space-y-6 pb-20">
      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-[100] space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={cn("px-4 py-3 rounded-xl text-sm font-medium shadow-2xl border pointer-events-auto transition-all",
            t.type === "ok" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border-rose-500/30")}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CheckSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Tâches quotidiennes</h1>
              <p className="text-sm text-muted-foreground">Organisez vos actions journalières et recevez des rappels.</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {notifPerm !== "granted" && (
            <button onClick={requestNotif} className="btn-secondary flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4" /> Activer notifications
            </button>
          )}
          <button onClick={() => { setEditTask(undefined); setShowModal(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Nouvelle tâche
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Aujourd'hui", val: stats.today, icon: <Clock className="h-4 w-4 text-blue-400" />, cls: "text-blue-400" },
          { label: "Terminées", val: stats.done, icon: <Check className="h-4 w-4 text-emerald-400" />, cls: "text-emerald-400" },
          { label: "En retard", val: stats.overdue, icon: <AlertTriangle className="h-4 w-4 text-rose-400" />, cls: "text-rose-400" },
          { label: "Rappels actifs", val: stats.reminders, icon: <Bell className="h-4 w-4 text-amber-400" />, cls: "text-amber-400" },
        ].map((s, i) => (
          <div key={i} className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-1.5">{s.icon}<p className="text-xs text-muted-foreground">{s.label}</p></div>
            <p className={cn("text-2xl font-bold font-mono", s.cls)}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      <div className="p-4 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-amber-400" />
          <h2 className="font-semibold text-sm">Suggestions du jour</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => addSuggestion(s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border hover:border-primary/30 text-xs transition-all">
              <span>{CATEGORY_CFG[s.category].emoji}</span>
              <span>{s.title}</span>
              <Plus className="h-3 w-3 opacity-60" />
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border">
          {FILTERS.map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", filter === f.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {f.label}
            </button>
          ))}
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="input-base !w-auto text-xs">
          <option value="all">Toutes catégories</option>
          {Object.entries(CATEGORY_CFG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
        <select value={prioFilter} onChange={e => setPrioFilter(e.target.value)} className="input-base !w-auto text-xs">
          <option value="all">Toutes priorités</option>
          {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={load} className="p-2 rounded-lg border border-border hover:bg-accent transition-colors">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 rounded-xl skeleton" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Aucune tâche pour ce filtre</p>
          <p className="text-sm mt-1">Créez votre première tâche en cliquant sur &quot;Nouvelle tâche&quot;</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <div key={task.id} className={cn(
              "group p-4 rounded-xl bg-card border transition-all hover:shadow-lg",
              task.status === "DONE" ? "opacity-60 border-border" : isOverdue(task) ? "border-rose-500/40 bg-rose-500/5" : isToday(task) ? "border-primary/30 bg-primary/5" : "border-border hover:border-border/80"
            )}>
              <div className="flex items-start gap-3">
                {/* Complete checkbox */}
                <button onClick={() => task.status !== "DONE" ? completeTask(task.id) : updateTask(task.id, { status: "TODO", completedAt: null })}
                  className={cn("mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all",
                    task.status === "DONE" ? "bg-emerald-500 border-emerald-500" : "border-border hover:border-primary")}>
                  {task.status === "DONE" && <Check className="h-3 w-3 text-white" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={cn("text-sm font-medium", task.status === "DONE" && "line-through text-muted-foreground")}>{task.title}</span>
                    <span className="text-xs">{CATEGORY_CFG[task.category].emoji}</span>
                    <span className={cn("badge-status border text-[10px]", PRIORITY_CFG[task.priority].cls)}>{PRIORITY_CFG[task.priority].label}</span>
                    <span className={cn("badge-status border text-[10px]", STATUS_CFG[task.status].cls)}>{STATUS_CFG[task.status].label}</span>
                    {isOverdue(task) && <span className="badge-status border text-[10px] bg-rose-500/20 text-rose-400 border-rose-500/30">⚠ En retard</span>}
                    {task.repeat !== "NONE" && <span className="badge-status border text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">🔁 {REPEAT_CFG[task.repeat]}</span>}
                  </div>
                  {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                    {task.dueDate && <span className={cn("flex items-center gap-1", isOverdue(task) && "text-rose-400")}><Clock className="h-3 w-3" />{new Date(task.dueDate).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                    {task.reminderAt && <span className="flex items-center gap-1"><Bell className="h-3 w-3" />{new Date(task.reminderAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleReminder(task)} title={task.reminderEnabled ? "Désactiver rappel" : "Activer rappel"}
                    className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                    {task.reminderEnabled ? <Bell className="h-3.5 w-3.5 text-amber-400" /> : <BellOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  <button onClick={() => setEditTask(task)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                  <button onClick={() => deleteTask(task.id)} className="p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-rose-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showModal && <TaskModal onClose={() => setShowModal(false)} onSave={createTask} />}
      {editTask && <TaskModal task={editTask} onClose={() => setEditTask(undefined)} onSave={d => updateTask(editTask.id, d)} />}
    </div>
  );
}
