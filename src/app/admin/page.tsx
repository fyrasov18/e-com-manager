import { redirect } from "next/navigation";
import { Activity, AlertTriangle, Building2, CreditCard, Shield, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PlatformAdminPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin");
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformAdmin: true },
  });

  if (!currentUser?.isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle className="h-6 w-6 text-amber-300" />
        </div>
        <h1 className="text-2xl font-semibold">Platform admin access required</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This global console is reserved for E-com Manager platform operators. Workspace admins
          can manage their own users from Settings.
        </p>
      </div>
    );
  }

  const [users, workspaces, subscriptions, activityLogs, auditLogs] = await Promise.all([
    prisma.user.count(),
    prisma.team.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.activityLog.count(),
    prisma.auditLog.count(),
  ]);

  const recentWorkspaces = await prisma.team.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      plan: { select: { name: true, code: true } },
      owner: { select: { email: true, name: true } },
    },
  });

  const stats = [
    { label: "Users", value: users, icon: Users },
    { label: "Workspaces", value: workspaces, icon: Building2 },
    { label: "Active subscriptions", value: subscriptions, icon: CreditCard },
    { label: "Activity events", value: activityLogs, icon: Activity },
    { label: "Audit events", value: auditLogs, icon: Shield },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-emerald-300">Super Admin</p>
        <h1 className="mt-2 text-3xl font-semibold">Platform overview</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Global operator dashboard for monitoring users, workspaces, subscriptions, and platform activity.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
            <stat.icon className="h-5 w-5 text-emerald-300" />
            <p className="mt-4 text-3xl font-semibold">{stat.value.toLocaleString("fr-FR")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">Recent workspaces</h2>
        </div>
        <div className="divide-y divide-border">
          {recentWorkspaces.map((workspace) => (
            <div key={workspace.id} className="grid gap-3 p-5 md:grid-cols-[1fr_180px_160px] md:items-center">
              <div>
                <p className="font-medium">{workspace.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {workspace.owner?.name || workspace.owner?.email || "No owner assigned"}
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {workspace.plan?.name ?? "Free"}
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-center text-xs font-medium text-emerald-300">
                {workspace.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
