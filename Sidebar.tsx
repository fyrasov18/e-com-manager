"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  CreditCard,
  Users,
  Settings,
  Warehouse,
} from "lucide-react";
import LogoutButton from "@/components/admin/LogoutButton";

const links = [
  { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/products", label: "Produits", icon: Package },
  { href: "/admin/stock", label: "Stock", icon: Warehouse },
  { href: "/admin/orders", label: "Commandes", icon: ShoppingCart },
  { href: "/admin/payments", label: "Paiements", icon: CreditCard },
  { href: "/admin/customers", label: "Clients", icon: Users },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 flex-shrink-0 bg-background border-r border-border flex flex-col py-4">
      <div className="px-4 pb-5 mb-3 border-b border-border">
        <span className="text-lg font-medium">
          <span className="text-orange-600">J</span> Jody Shop
        </span>
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-2">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-secondary text-foreground font-medium border-l-2 border-orange-600 rounded-l-none"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 mt-auto space-y-1">
        <Link
          href="/admin/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Settings size={15} />
          Paramètres
        </Link>
        <LogoutButton />
      </div>
    </aside>
  );
}
