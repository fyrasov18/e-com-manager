"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, LayoutDashboard, Package, Settings, ShoppingCart } from "lucide-react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { canAccessPath, normalizeRole } from "@/lib/rbac";

const publicShellPaths = ["/", "/login", "/register", "/setup"];

const mobileNav = [
  { href: "/dashboard", label: "Tableau", icon: LayoutDashboard },
  { href: "/orders", label: "Commandes", icon: ShoppingCart },
  { href: "/products", label: "Produits", icon: Package },
  { href: "/finance", label: "Finance", icon: CreditCard },
  { href: "/settings", label: "Parametres", icon: Settings },
];

function isPublicShellPath(pathname: string) {
  return publicShellPaths.some((path) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { data: session } = useSession();
  const userRole = normalizeRole(session?.user?.role);
  const visibleMobileNav = mobileNav.filter((item) =>
    canAccessPath(item.href, userRole)
  );

  if (isPublicShellPath(pathname)) {
    return <main className="min-h-screen w-full">{children}</main>;
  }

  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl px-4 py-2">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-1">
          {visibleMobileNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-w-[0] flex-1 flex-col items-center justify-center rounded-3xl px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/20 transition-colors"
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
