"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Bell, ChevronDown, LogOut, Search, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccessPath, normalizeRole } from "@/lib/rbac";

export function Header() {
  const { data: session, status } = useSession();
  const [userOpen, setUserOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const userName =
    session?.user?.name || session?.user?.email?.split("@")[0] || "Admin";
  const userEmail = session?.user?.email || "";
  const userRole = session?.user?.role
    ? normalizeRole(session.user.role)
    : status === "loading"
      ? "admin"
      : "user";
  const canManageSettings = canAccessPath("/settings", userRole);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-30 px-4 lg:px-8 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 flex-1 pl-10 lg:pl-0">
        <div className="relative w-full max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-input rounded-xl text-sm bg-background/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-all"
            placeholder="Rechercher commandes, produits, clients..."
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
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
