import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Ecom Manager - Tableau de bord e-commerce",
  description:
    "Plateforme professionnelle de gestion e-commerce: commandes, produits, stock, livraisons, paiements et analytics.",
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
