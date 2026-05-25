import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "E-com Manager - Tableau de bord e-commerce",
  description:
    "Plateforme professionnelle de gestion e-commerce: commandes, produits, stock, livraisons, paiements et analytics.",
  icons: {
    icon: [{ url: "/brand/ecom-manager-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/brand/ecom-manager-icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="font-sans antialiased bg-background text-foreground min-h-screen flex">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
