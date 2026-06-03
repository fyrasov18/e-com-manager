"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  Bell,
  Building2,
  ChevronDown,
  Loader2,
  LogOut,
  Search,
  Settings,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  canAccessPathWithPermissions,
  resolveEffectivePermissions,
} from "@/lib/rbac";

type WorkspaceOption = {
  id: string;
  name: string;
  roleName: string | null;
  isActive: boolean;
};

export function Header() {
  const { data: session, status, update } = useSession();
  const [userOpen, setUserOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);

  const userName =
    session?.user?.name || session?.user?.email?.split("@")[0] || "Admin";
  const userEmail = session?.user?.email || "";
  const permissions =
    status === "loading"
      ? ["admin:all"]
      : resolveEffectivePermissions({
          permissions: session?.user?.permissions,
          role: session?.user?.role,
          isPlatformAdmin: session?.user?.isPlatformAdmin,
          isWorkspaceOwner: session?.user?.isWorkspaceOwner,
        });
  const canManageSettings = canAccessPathWithPermissions("/settings", permissions);

  useEffect(() => {
    if (status !== "authenticated") {
      setWorkspaces([]);
      return;
    }

    let cancelled = false;

    async function loadWorkspaces() {
      try {
        const response = await fetch("/api/workspaces", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));

        if (!cancelled && response.ok && Array.isArray(data.workspaces)) {
          setWorkspaces(data.workspaces);
        }
      } catch {
        if (!cancelled) {
          setWorkspaces([]);
        }
      }
    }

    void loadWorkspaces();

    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.workspaceId]);

  async function handleWorkspaceChange(workspaceId: string) {
    if (!workspaceId || workspaceId === session?.user?.workspaceId) {
      return;
    }

    setSwitchingWorkspace(true);

    try {
      const response = await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });

      if (response.ok) {
        await update();
        window.location.href = "/dashboard";
      }
    } finally {
      setSwitchingWorkspace(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/72 px-4 backdrop-blur-2xl lg:px-8">
      <div className="flex items-center gap-4 flex-1 pl-10 lg:pl-0">
        <div className="relative w-full max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <input
            type="text"
            className="block w-full rounded-2xl border border-input bg-card/60 py-2.5 pl-10 pr-3 text-sm text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
            placeholder="Rechercher commandes, produits, clients..."
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {workspaces.length > 1 && (
          <div className="hidden items-center gap-2 rounded-xl border border-border bg-background/50 px-2 py-1.5 md:flex">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <select
              value={session?.user?.workspaceId ?? ""}
              onChange={(event) => void handleWorkspaceChange(event.target.value)}
              disabled={switchingWorkspace}
              className="max-w-44 bg-transparent text-sm outline-none"
              aria-label="Changer d'organisation"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            {switchingWorkspace && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
        )}

        <button className="relative p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 block h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setUserOpen((open) => !open)}
            className="flex items-center gap-2 p-1.5 pr-3 rounded-xl hover:bg-accent/50 transition-colors"
            aria-expanded={userOpen}
            aria-haspopup="menu"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium hidden sm:block">{userName}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                userOpen && "rotate-180"
              )}
            />
          </button>

          {userOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 py-2 rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-xl">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-sm font-medium truncate">{userName}</p>
                {userEmail && (
                  <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                )}
              </div>
              {canManageSettings && (
                <Link
                  href="/settings"
                  onClick={() => setUserOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  Parametres
                </Link>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
              >
                <LogOut className={cn("h-4 w-4", signingOut && "animate-pulse")} />
                {signingOut ? "Deconnexion..." : "Deconnexion"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
