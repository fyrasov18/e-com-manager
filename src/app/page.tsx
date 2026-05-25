import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  CreditCard,
  FileText,
  LineChart,
  Lock,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { BrandLogo, BrandMark } from "@/components/brand/BrandLogo";

const features = [
  {
    title: "Workspace operations",
    description: "Orders, products, deliveries, payments, expenses, tasks, and goals in one clean operating system.",
    icon: Boxes,
  },
  {
    title: "Revenue intelligence",
    description: "Track validated revenue, net profit, return costs, delivery fees, and cash collection by provider.",
    icon: LineChart,
  },
  {
    title: "Delivery integrations",
    description: "Connect Colissimo and InstaDelivery flows while keeping every workspace isolated.",
    icon: Truck,
  },
  {
    title: "Subscription ready",
    description: "Free today, prepared for Pro, Business, and Enterprise billing with usage limits and invoices.",
    icon: CreditCard,
  },
];

const showcaseStats = [
  ["Orders", "2,480"],
  ["Validated revenue", "84.2K DT"],
  ["Net margin", "31.8%"],
  ["Open tasks", "18"],
];

const faqs = [
  ["Can multiple businesses use it?", "Yes. Each account gets an isolated workspace so customers manage only their own data."],
  ["Is it paid today?", "The current plan is Free. The data model is prepared for paid subscriptions and invoices."],
  ["Does it keep delivery features?", "Yes. Existing order, payment, delivery, expense, tracking, and analytics tools stay inside the SaaS workspace."],
  ["Can an admin manage users?", "Workspace admins can manage users in their own workspace, while platform admin models are ready for global operations."],
];

const trustPillars = [
  {
    title: "Secure by design",
    copy: "Auth.js sessions, backend guards, rate limiting, CSRF/origin checks, and workspace-scoped APIs.",
    icon: ShieldCheck,
  },
  {
    title: "Team ready",
    copy: "Membership and role models prepare the product for teams, collaborators, and workspace owners.",
    icon: Users,
  },
  {
    title: "Operationally scalable",
    copy: "Plans, subscriptions, invoices, usage events, API keys, audit logs, and activity logs are in the data model.",
    icon: Zap,
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen w-full overflow-hidden bg-background text-foreground">
      <section className="relative border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <BrandLogo markClassName="h-10 w-10" textClassName="text-xl" />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-secondary rounded-lg px-3 py-2">
              Sign in
            </Link>
            <Link href="/register" className="btn-primary rounded-lg px-3 py-2">
              Start free
            </Link>
          </div>
        </div>

        <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <Sparkles className="h-3.5 w-3.5" />
              Multi-tenant SaaS foundation now active
            </div>
            <h1 className="max-w-4xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl lg:text-6xl">
              Run every e-commerce operation from one secure workspace.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              E-com Manager gives business owners a premium dashboard for orders, analytics,
              delivery tracking, payments, revenue, expenses, and growth. Built for public
              SaaS signups and future subscription revenue.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="btn-primary rounded-lg px-5 py-3">
                Create free workspace
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link href="/login" className="btn-secondary rounded-lg px-5 py-3">
                Open dashboard
              </Link>
            </div>
            <div className="mt-8 grid max-w-2xl grid-cols-1 gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              {["Workspace isolation", "Free plan included", "Stripe-ready architecture"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-2xl shadow-black/30">
            <div className="rounded-xl border border-border bg-background/70 p-4">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BrandMark className="h-10 w-10" />
                  <div>
                    <p className="text-sm font-semibold">Workspace dashboard</p>
                    <p className="text-xs text-muted-foreground">Live commerce control center</p>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                  Free
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {showcaseStats.map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-2 text-2xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-medium">Revenue performance</p>
                  <BarChart3 className="h-4 w-4 text-emerald-300" />
                </div>
                <div className="flex h-28 items-end gap-2">
                  {[38, 54, 45, 72, 64, 88, 76, 94].map((height, index) => (
                    <div key={index} className="flex-1 rounded-t-lg bg-gradient-to-t from-emerald-500 to-cyan-300" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-emerald-300">Platform features</p>
            <h2 className="mt-2 text-3xl font-semibold">Built like a modern SaaS platform</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            A clean foundation for isolated customer workspaces, usage tracking, future paid plans,
            audit trails, and operational dashboards.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-border bg-card/70 p-5">
              <feature.icon className="h-6 w-6 text-emerald-300" />
              <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-muted/20">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-3">
          {trustPillars.map((pillar) => (
            <div key={pillar.title} className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
                <pillar.icon className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <h3 className="font-semibold">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{pillar.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-sm font-medium text-emerald-300">Pricing</p>
            <h2 className="mt-2 text-3xl font-semibold">Start free. Upgrade path ready.</h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              The current product runs on a Free Plan, with database and usage architecture ready
              for Pro, Business, and Enterprise subscriptions.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Free</h3>
                <PackageCheck className="h-5 w-5 text-emerald-300" />
              </div>
              <p className="mt-3 text-4xl font-semibold">$0</p>
              <p className="mt-2 text-sm text-muted-foreground">For launching and validating operations.</p>
              <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                {["100 orders", "10 imports", "3 users", "Basic analytics"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card/70 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Pro and Business</h3>
                <FileText className="h-5 w-5 text-cyan-300" />
              </div>
              <p className="mt-3 text-4xl font-semibold">Ready</p>
              <p className="mt-2 text-sm text-muted-foreground">Stripe-ready billing tables and invoices.</p>
              <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                {["Monthly and annual billing", "Usage tracking", "Payment history", "Enterprise upgrade path"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-cyan-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <div className="text-center">
          <p className="text-sm font-medium text-emerald-300">FAQ</p>
          <h2 className="mt-2 text-3xl font-semibold">SaaS foundations, without losing the current product</h2>
        </div>
        <div className="mt-10 grid gap-3">
          {faqs.map(([question, answer]) => (
            <div key={question} className="rounded-xl border border-border bg-card/70 p-5">
              <h3 className="font-semibold">{question}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <div className="rounded-2xl border border-border bg-card/80 p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-emerald-300" />
          <h2 className="mt-4 text-3xl font-semibold">Create your secure e-commerce workspace</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Start with the Free Plan and keep every order, delivery, payment, and expense isolated to your workspace.
          </p>
          <Link href="/register" className="btn-primary mt-6 rounded-lg px-5 py-3">
            Start free
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-muted-foreground md:flex-row md:items-center">
          <BrandLogo markClassName="h-8 w-8" textClassName="text-base" />
          <p>© {new Date().getFullYear()} E-com Manager. Manage. Analyze. Grow.</p>
        </div>
      </footer>
    </main>
  );
}
