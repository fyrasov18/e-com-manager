"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  LineChart,
  Target,
  Settings,
  Menu,
  X,
  Wallet,
  Receipt,
  Upload,
  CheckSquare,
  LogOut,
  Users,
} from "lucide-react";
import { useState, useEffect } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";
import {
  canAccessPathWithPermissions,
  resolveEffectivePermissions,
} from "@/lib/rbac";

const navigation = [
  { name: "Vue d'ensemble", href: "/dashboard", icon: LayoutDashboard },
  { name: "Tâches", href: "/tasks", icon: CheckSquare, badge: true },
  { name: "Commandes", href: "/orders", icon: ShoppingCart },
  { name: "Finance", href: "/finance", icon: Wallet },
  { name: "Produits", href: "/products", icon: Package },
  { name: "Livraison API", href: "/shipping-providers", icon: Truck },
  { name: "Dépenses", href: "/expenses", icon: Receipt },
  { name: "Importer", href: "/import", icon: Upload },
  { name: "Analytics", href: "/analytics", icon: LineChart },
  { name: "Objectifs", href: "/goals", icon: Target },
  { name: "Paramètres", href: "/settings", icon: Settings },
  { name: "Utilisateurs", href: "/settings/users", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [taskBadge, setTaskBadge] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const fetchBadge = async () => {
      try {
        const res = await fetch("/api/tasks?filter=overdue");
        if (!res.ok) return;
        const data = await res.json();
        const today = await fetch("/api/tasks?filter=today").then(r => r.json()).catch(() => ({ tasks: [] }));
        const overdue = (data.tasks ?? []).length;
        const todayPending = (today.tasks ?? []).filter((t: any) => t.status !== "DONE").length;
        setTaskBadge(overdue + todayPending);
      } catch {}
    };
    fetchBadge();
    const id = setInterval(fetchBadge, 60_000);
    return () => clearInterval(id);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ callbackUrl: "/login" });
  }

  // Initiale de l'utilisateur pour l'avatar
  const userInitial = session?.user?.name?.[0]?.toUpperCase()
    ?? session?.user?.email?.[0]?.toUpperCase()
    ?? "A";
  const userName = session?.user?.name || session?.user?.email?.split("@")[0] || "Admin";
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
  const visibleNavigation = navigation.filter((item) =>
    canAccessPathWithPermissions(item.href, permissions)
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-card border border-border"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur-2xl transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between border-b border-sidebar-border p-6 lg:justify-center">
          <Link href="/dashboard" className="min-w-0">
            <BrandLogo markClassName="h-9 w-9" textClassName="text-lg" />
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded-md hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto p-4">
          {visibleNavigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "nav-item group flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground active"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 flex-shrink-0 transition-colors duration-200",
                    isActive
                      ? "text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground"
                  )}
                />
                <span className="truncate flex-1">{item.name}</span>
                {(item as any).badge && taskBadge > 0 && (
                  <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold flex items-center justify-center border border-rose-500/30">
                    {taskBadge > 99 ? "99+" : taskBadge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User info + Logout */}
        <div className="space-y-2 border-t border-sidebar-border p-4">
          {/* User card */}
          <div className="flex items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/80 px-3 py-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
              {userInitial}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-medium text-sidebar-accent-foreground truncate">
                {userName}
              </span>
              {userEmail && (
                <span className="text-[11px] text-sidebar-foreground/50 truncate">{userEmail}</span>
              )}
            </div>
          </div>

          {/* Logout button */}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/60 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200 disabled:opacity-50"
          >
            <LogOut className={cn("h-4 w-4 flex-shrink-0", signingOut && "animate-pulse")} />
            <span>{signingOut ? "Déconnexion..." : "Se déconnecter"}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
