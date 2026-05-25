"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { PERMISSION_GROUPS, type Permission } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type MemberStatus = "ACTIVE" | "INACTIVE";

type Member = {
  membershipId: string;
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: MemberStatus;
  accountStatus: string;
  roleId: string | null;
  roleName: string;
  isOwnerRole: boolean;
  isSystemRole: boolean;
  createdAt: string;
  updatedAt: string;
  userCreatedAt: string;
};

type WorkspaceRole = {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  isSystem: boolean;
  isOwner: boolean;
  editable: boolean;
  createdAt: string;
  updatedAt: string;
};

type Notice = {
  type: "success" | "error";
  message: string;
} | null;

type UserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  roleId: string;
};

type RoleForm = {
  id: string | null;
  name: string;
  description: string;
  permissions: Permission[];
};

const DEFAULT_USER_FORM: UserForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  roleId: "",
};

const DEFAULT_ROLE_FORM: RoleForm = {
  id: null,
  name: "",
  description: "",
  permissions: ["dashboard:read", "profile:read"],
};

const STATUS_STYLES: Record<MemberStatus, string> = {
  ACTIVE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  INACTIVE: "border-rose-500/30 bg-rose-500/10 text-rose-400",
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : dateFormatter.format(date);
}

function getStatusCount(users: Member[], status: MemberStatus) {
  return users.filter((user) => user.status === status).length;
}

function hasAllPermissions(role: RoleForm, permissions: readonly Permission[]) {
  return permissions.every((permission) => role.permissions.includes(permission));
}

function mergePermissions(
  current: Permission[],
  permissions: readonly Permission[],
  checked: boolean
) {
  const next = new Set(current);

  for (const permission of permissions) {
    if (checked) {
      next.add(permission);
    } else {
      next.delete(permission);
    }
  }

  next.add("profile:read");
  return Array.from(next);
}

export default function UsersSettingsPageClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [activeTab, setActiveTab] = useState<"members" | "roles">("members");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [userForm, setUserForm] = useState<UserForm>(DEFAULT_USER_FORM);
  const [roleForm, setRoleForm] = useState<RoleForm>(DEFAULT_ROLE_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const activeCount = getStatusCount(members, "ACTIVE");
  const editableRoles = useMemo(
    () => roles.filter((role) => !role.isOwner),
    [roles]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    try {
      const [usersResponse, rolesResponse] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/roles", { cache: "no-store" }),
      ]);
      const usersData = await usersResponse.json().catch(() => ({}));
      const rolesData = await rolesResponse.json().catch(() => ({}));

      if (!usersResponse.ok || !Array.isArray(usersData.users)) {
        setNotice({
          type: "error",
          message: usersData.error || "Impossible de charger les utilisateurs.",
        });
        return;
      }

      if (!rolesResponse.ok || !Array.isArray(rolesData.roles)) {
        setNotice({
          type: "error",
          message: rolesData.error || "Impossible de charger les roles.",
        });
        return;
      }

      setMembers(usersData.users);
      setRoles(rolesData.roles);
    } catch {
      setNotice({ type: "error", message: "Erreur reseau." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openUserModal() {
    setFieldErrors({});
    setNotice(null);
    setUserForm({
      ...DEFAULT_USER_FORM,
      roleId: editableRoles[0]?.id ?? roles[0]?.id ?? "",
    });
    setShowUserModal(true);
  }

  function openRoleModal(role?: WorkspaceRole) {
    setFieldErrors({});
    setNotice(null);
    setRoleForm(
      role
        ? {
            id: role.id,
            name: role.name,
            description: role.description ?? "",
            permissions: role.permissions,
          }
        : DEFAULT_ROLE_FORM
    );
    setShowRoleModal(true);
  }

  async function createUser() {
    setBusyKey("user:create");
    setNotice(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.user) {
        setFieldErrors(data.errors ?? {});
        setNotice({
          type: "error",
          message: data.error || "Impossible d'ajouter cet utilisateur.",
        });
        return;
      }

      setMembers((current) => [data.user, ...current]);
      setShowUserModal(false);
      setNotice({ type: "success", message: "Utilisateur ajoute a l'organisation." });
    } catch {
      setNotice({ type: "error", message: "Erreur reseau." });
    } finally {
      setBusyKey(null);
    }
  }

  async function updateMember(
    userId: string,
    body: { roleId?: string; status?: MemberStatus },
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

      setMembers((current) =>
        current.map((member) => (member.id === userId ? data.user : member))
      );
      setNotice({ type: "success", message: successMessage });
    } catch {
      setNotice({ type: "error", message: "Erreur reseau." });
    } finally {
      setBusyKey(null);
    }
  }

  async function removeMember(member: Member) {
    const confirmed = window.confirm(
      `Retirer ${member.name} de cette organisation ?`
    );

    if (!confirmed) {
      return;
    }

    setBusyKey(`${member.id}:delete`);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/users/${member.id}`, {
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

      setMembers((current) => current.filter((item) => item.id !== member.id));
      setNotice({ type: "success", message: "Utilisateur retire de l'organisation." });
    } catch {
      setNotice({ type: "error", message: "Erreur reseau." });
    } finally {
      setBusyKey(null);
    }
  }

  async function saveRole() {
    setBusyKey("role:save");
    setNotice(null);
    setFieldErrors({});

    const isEditing = Boolean(roleForm.id);

    try {
      const response = await fetch(
        isEditing ? `/api/admin/roles/${roleForm.id}` : "/api/admin/roles",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(roleForm),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.role) {
        setFieldErrors(data.errors ?? {});
        setNotice({
          type: "error",
          message: data.error || "Impossible d'enregistrer ce role.",
        });
        return;
      }

      setRoles((current) =>
        isEditing
          ? current.map((role) => (role.id === data.role.id ? data.role : role))
          : [...current, data.role].sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name))
      );
      setShowRoleModal(false);
      setNotice({ type: "success", message: "Role enregistre." });
    } catch {
      setNotice({ type: "error", message: "Erreur reseau." });
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteRole(role: WorkspaceRole) {
    const confirmed = window.confirm(`Supprimer le role ${role.name} ?`);

    if (!confirmed) {
      return;
    }

    setBusyKey(`${role.id}:delete`);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/roles/${role.id}`, {
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

      setRoles((current) => current.filter((item) => item.id !== role.id));
      setNotice({ type: "success", message: "Role supprime." });
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
            Organisation
          </h1>
          <p className="mt-1 text-sm text-muted-foreground lg:text-base">
            Gere les utilisateurs, les roles et les permissions de votre organisation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="btn-secondary gap-2 rounded-lg disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Actualiser
          </button>
          <button
            type="button"
            onClick={openUserModal}
            className="btn-primary gap-2 rounded-lg"
          >
            <UserPlus className="h-4 w-4" />
            Ajouter utilisateur
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Membres</p>
          <p className="mt-2 text-2xl font-semibold">{members.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs uppercase text-emerald-300">Actifs</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-300">
            {activeCount}
          </p>
        </div>
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <p className="text-xs uppercase text-cyan-300">Roles</p>
          <p className="mt-2 text-2xl font-semibold text-cyan-300">
            {roles.length}
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

      <div className="flex w-fit rounded-xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setActiveTab("members")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "members"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Utilisateurs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("roles")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "roles"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Roles
        </button>
      </div>

      {activeTab === "members" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Chargement...
            </div>
          ) : members.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Users className="mb-3 h-8 w-8" />
              Aucun utilisateur trouve.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nom</th>
                    <th className="px-4 py-3 font-medium">Telephone</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Ajoute le</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((member) => {
                    const busy = busyKey?.startsWith(`${member.id}:`) ?? false;

                    return (
                      <tr key={member.membershipId} className="table-row-hover">
                        <td className="px-4 py-4">
                          <div className="font-medium text-foreground">{member.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {member.email}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          {member.phone || "-"}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-2">
                            <span className="badge-status w-fit border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                              <Shield className="h-3 w-3" />
                              {member.roleName}
                            </span>
                            <select
                              value={member.roleId ?? ""}
                              disabled={busy}
                              onChange={(event) =>
                                void updateMember(
                                  member.id,
                                  { roleId: event.target.value },
                                  "Role utilisateur modifie."
                                )
                              }
                              className="w-40 rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                              aria-label={`Modifier le role de ${member.name}`}
                            >
                              {roles.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-2">
                            <span
                              className={cn(
                                "badge-status w-fit border",
                                STATUS_STYLES[member.status]
                              )}
                            >
                              {member.status}
                            </span>
                            <select
                              value={member.status}
                              disabled={busy}
                              onChange={(event) =>
                                void updateMember(
                                  member.id,
                                  { status: event.target.value as MemberStatus },
                                  "Status utilisateur modifie."
                                )
                              }
                              className="w-32 rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                              aria-label={`Modifier le status de ${member.name}`}
                            >
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="INACTIVE">INACTIVE</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          {formatDate(member.createdAt)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void removeMember(member)}
                              disabled={busy}
                              className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-400 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                              aria-label="Retirer utilisateur"
                            >
                              {busyKey === `${member.id}:delete` ? (
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
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => openRoleModal()}
              className="btn-primary gap-2 rounded-lg"
            >
              <Plus className="h-4 w-4" />
              Nouveau role
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {roles.map((role) => (
              <div key={role.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{role.name}</h3>
                      {role.isOwner && (
                        <span className="badge-status border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                          Protege
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {role.description || "Aucune description."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {role.editable && (
                      <button
                        type="button"
                        onClick={() => openRoleModal(role)}
                        className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Modifier role"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                    )}
                    {role.editable && (
                      <button
                        type="button"
                        onClick={() => void deleteRole(role)}
                        disabled={busyKey === `${role.id}:delete`}
                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-400 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                        aria-label="Supprimer role"
                      >
                        {busyKey === `${role.id}:delete` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {role.isOwner ? (
                    <span className="badge-status border border-primary/30 bg-primary/10 text-primary">
                      Tous les acces
                    </span>
                  ) : (
                    PERMISSION_GROUPS.filter((group) =>
                      group.permissions.some((permission) =>
                        role.permissions.includes(permission)
                      )
                    ).map((group) => (
                      <span
                        key={group.key}
                        className="badge-status border border-border bg-muted/40 text-muted-foreground"
                      >
                        {group.label}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Ajouter utilisateur</h2>
                <p className="text-sm text-muted-foreground">
                  Creez ou attachez un utilisateur a cette organisation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm text-muted-foreground">Nom complet</span>
                <input
                  value={userForm.name}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, name: event.target.value }))
                  }
                  className="input-base"
                />
                {fieldErrors.name && <p className="text-xs text-rose-400">{fieldErrors.name}</p>}
              </label>
              <label className="space-y-1.5">
                <span className="text-sm text-muted-foreground">Email</span>
                <input
                  value={userForm.email}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, email: event.target.value }))
                  }
                  type="email"
                  className="input-base"
                />
                {fieldErrors.email && <p className="text-xs text-rose-400">{fieldErrors.email}</p>}
              </label>
              <label className="space-y-1.5">
                <span className="text-sm text-muted-foreground">Telephone</span>
                <input
                  value={userForm.phone}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, phone: event.target.value }))
                  }
                  className="input-base"
                />
                {fieldErrors.phone && <p className="text-xs text-rose-400">{fieldErrors.phone}</p>}
              </label>
              <label className="space-y-1.5">
                <span className="text-sm text-muted-foreground">Mot de passe</span>
                <input
                  value={userForm.password}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, password: event.target.value }))
                  }
                  type="password"
                  className="input-base"
                />
                {fieldErrors.password && (
                  <p className="text-xs text-rose-400">{fieldErrors.password}</p>
                )}
              </label>
              <label className="space-y-1.5">
                <span className="text-sm text-muted-foreground">Confirmation</span>
                <input
                  value={userForm.confirmPassword}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                  type="password"
                  className="input-base"
                />
                {fieldErrors.confirmPassword && (
                  <p className="text-xs text-rose-400">{fieldErrors.confirmPassword}</p>
                )}
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm text-muted-foreground">Role</span>
                <select
                  value={userForm.roleId}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, roleId: event.target.value }))
                  }
                  className="input-base"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.roleId && <p className="text-xs text-rose-400">{fieldErrors.roleId}</p>}
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                className="btn-secondary rounded-lg"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void createUser()}
                disabled={busyKey === "user:create"}
                className="btn-primary gap-2 rounded-lg disabled:opacity-50"
              >
                {busyKey === "user:create" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  {roleForm.id ? "Modifier role" : "Nouveau role"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Selectionnez les acces avec les cases a cocher.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRoleModal(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm text-muted-foreground">Nom du role</span>
                <input
                  value={roleForm.name}
                  onChange={(event) =>
                    setRoleForm((current) => ({ ...current, name: event.target.value }))
                  }
                  className="input-base"
                />
                {fieldErrors.name && <p className="text-xs text-rose-400">{fieldErrors.name}</p>}
              </label>
              <label className="space-y-1.5">
                <span className="text-sm text-muted-foreground">Description</span>
                <input
                  value={roleForm.description}
                  onChange={(event) =>
                    setRoleForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="input-base"
                />
                {fieldErrors.description && (
                  <p className="text-xs text-rose-400">{fieldErrors.description}</p>
                )}
              </label>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PERMISSION_GROUPS.map((group) => {
                const checked = hasAllPermissions(roleForm, group.permissions);

                return (
                  <label
                    key={group.key}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/40 p-3 transition-colors hover:bg-accent/40"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setRoleForm((current) => ({
                          ...current,
                          permissions: mergePermissions(
                            current.permissions,
                            group.permissions,
                            event.target.checked
                          ),
                        }))
                      }
                      className="mt-1 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium">{group.label}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {group.permissions.join(", ")}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRoleModal(false)}
                className="btn-secondary rounded-lg"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void saveRole()}
                disabled={busyKey === "role:save"}
                className="btn-primary gap-2 rounded-lg disabled:opacity-50"
              >
                {busyKey === "role:save" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
