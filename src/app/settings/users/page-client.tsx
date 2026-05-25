"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AdminUserRole = "ADMIN" | "USER";
type AdminUserStatus = "PENDING" | "APPROVED" | "REJECTED";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: AdminUserRole;
  status: AdminUserStatus;
  createdAt: string;
  updatedAt: string;
};

type Notice = {
  type: "success" | "error";
  message: string;
} | null;

const STATUS_STYLES: Record<AdminUserStatus, string> = {
  PENDING: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  APPROVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  REJECTED: "border-rose-500/30 bg-rose-500/10 text-rose-400",
};

const ROLE_STYLES: Record<AdminUserRole, string> = {
  ADMIN: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  USER: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateFormatter.format(date);
}

function getStatusCount(users: AdminUser[], status: AdminUserStatus) {
  return users.filter((user) => user.status === status).length;
}

export default function UsersSettingsPageClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const pendingCount = getStatusCount(users, "PENDING");
  const approvedCount = getStatusCount(users, "APPROVED");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !Array.isArray(data.users)) {
        setNotice({
          type: "error",
          message: data.error || "Impossible de charger les utilisateurs.",
        });
        return;
      }

      setUsers(data.users);
    } catch {
      setNotice({ type: "error", message: "Erreur reseau." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function updateUser(
    userId: string,
    body: { role?: AdminUserRole; status?: AdminUserStatus },
    successMessage: string
  ) {
    setBusyKey(`${userId}:update`);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.user) {
        setNotice({
          type: "error",
          message: data.error || "Modification impossible.",
        });
        return;
      }

      setUsers((current) =>
        current.map((user) => (user.id === userId ? data.user : user))
      );
      setNotice({ type: "success", message: successMessage });
    } catch {
      setNotice({ type: "error", message: "Erreur reseau." });
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteUser(user: AdminUser) {
    const confirmed = window.confirm(
      `Supprimer definitivement le compte de ${user.name} ?`
    );

    if (!confirmed) {
      return;
    }

    setBusyKey(`${user.id}:delete`);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        setNotice({
          type: "error",
          message: data.error || "Suppression impossible.",
        });
        return;
      }

      setUsers((current) => current.filter((item) => item.id !== user.id));
      setNotice({ type: "success", message: "Utilisateur supprime." });
    } catch {
      setNotice({ type: "error", message: "Erreur reseau." });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight lg:text-3xl">
            <Users className="h-7 w-7" />
            Utilisateurs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground lg:text-base">
            Gere les utilisateurs, les roles et les acces de votre workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadUsers()}
          disabled={loading}
          className="btn-secondary gap-2 rounded-lg disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualiser
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Total</p>
          <p className="mt-2 text-2xl font-semibold">{users.length}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-xs uppercase text-amber-300">En attente</p>
          <p className="mt-2 text-2xl font-semibold text-amber-300">
            {pendingCount}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs uppercase text-emerald-300">Approuves</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-300">
            {approvedCount}
          </p>
        </div>
      </div>

      {notice && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm",
            notice.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-rose-500/30 bg-rose-500/10 text-rose-400"
          )}
        >
          {notice.type === "success" ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {notice.message}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Chargement...
          </div>
        ) : users.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <Users className="mb-3 h-8 w-8" />
            Aucun utilisateur trouve.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Nom</th>
                  <th className="px-4 py-3 font-medium">Telephone</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Creation</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => {
                  const busy = busyKey?.startsWith(`${user.id}:`) ?? false;

                  return (
                    <tr key={user.id} className="table-row-hover">
                      <td className="px-4 py-4">
                        <div className="font-medium text-foreground">{user.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {user.email}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {user.phone || "-"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-2">
                          <span
                            className={cn(
                              "badge-status w-fit border",
                              ROLE_STYLES[user.role]
                            )}
                          >
                            <Shield className="h-3 w-3" />
                            {user.role}
                          </span>
                          <select
                            value={user.role}
                            disabled={busy}
                            onChange={(event) =>
                              void updateUser(
                                user.id,
                                { role: event.target.value as AdminUserRole },
                                "Role utilisateur modifie."
                              )
                            }
                            className="w-28 rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                            aria-label={`Modifier le role de ${user.name}`}
                          >
                            <option value="USER">USER</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-2">
                          <span
                            className={cn(
                              "badge-status w-fit border",
                              STATUS_STYLES[user.status]
                            )}
                          >
                            {user.status}
                          </span>
                          <select
                            value={user.status}
                            disabled={busy}
                            onChange={(event) =>
                              void updateUser(
                                user.id,
                                { status: event.target.value as AdminUserStatus },
                                "Status utilisateur modifie."
                              )
                            }
                            className="w-32 rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                            aria-label={`Modifier le status de ${user.name}`}
                          >
                            <option value="PENDING">PENDING</option>
                            <option value="APPROVED">APPROVED</option>
                            <option value="REJECTED">REJECTED</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {user.status !== "APPROVED" && (
                            <button
                              type="button"
                              onClick={() =>
                                void updateUser(
                                  user.id,
                                  { status: "APPROVED" },
                                  "Utilisateur approuve."
                                )
                              }
                              disabled={busy}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                              aria-label="Approuver utilisateur"
                            >
                              <UserCheck className="h-4 w-4" />
                            </button>
                          )}
                          {user.status !== "REJECTED" && (
                            <button
                              type="button"
                              onClick={() =>
                                void updateUser(
                                  user.id,
                                  { status: "REJECTED" },
                                  "Utilisateur refuse."
                                )
                              }
                              disabled={busy}
                              className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                              aria-label="Refuser utilisateur"
                            >
                              <UserX className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void deleteUser(user)}
                            disabled={busy}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-400 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                            aria-label="Supprimer utilisateur"
                          >
                            {busyKey === `${user.id}:delete` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
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
    </div>
  );
}
