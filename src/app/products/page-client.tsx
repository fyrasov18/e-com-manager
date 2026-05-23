"use client";

import { FormEvent, useEffect, useMemo, useState, useCallback } from "react";
import { Package, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  stockEnAttente: number;
  supplierName: string | null;
  revenue: number;
  margin: number;
  salesCount: number;
};

type Movement = {
  id: string;
  type: "IN" | "OUT";
  quantity: number;
  createdAt: string;
  product: { name: string; sku: string };
  purchaseInvoice: { invoiceNumber: string; supplierName: string } | null;
  deliveryNote: { noteNumber: string; companyName: string } | null;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [newProduct, setNewProduct] = useState({ name: "", sku: "", supplierName: "" });
  const [movementForm, setMovementForm] = useState({
    productId: "",
    quantity: 1,
    mode: "IN" as "IN" | "OUT",
    referenceNumber: "",
    partnerName: "",
  });

  const totalStock = useMemo(
    () => products.reduce((sum, product) => sum + product.stockQuantity, 0),
    [products]
  );

  const totalStockEnAttente = useMemo(
    () => products.reduce((sum, product) => sum + (product.stockEnAttente || 0), 0),
    [products]
  );

  const loadData = useCallback(async () => {
    setError("");
    const [productsRes, movementsRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/stock-movements"),
    ]);

    if (!productsRes.ok || !movementsRes.ok) {
      setError("Impossible de charger les donnees produits.");
      return;
    }

    const [productsData, movementsData] = await Promise.all([
      productsRes.json(),
      movementsRes.json(),
    ]);

    setProducts(productsData);
    setMovements(movementsData);
    if (productsData.length > 0 && !movementForm.productId) {
      setMovementForm((prev) => ({ ...prev, productId: productsData[0].id }));
    }
  }, [movementForm.productId]);

  useEffect(() => {
    setTimeout(() => { loadData(); }, 0);
  }, [loadData]);

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newProduct),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Creation produit echouee.");
      setSaving(false);
      return;
    }

    setNewProduct({ name: "", sku: "", supplierName: "" });
    await loadData();
    setSaving(false);
  }

  async function handleStockMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch("/api/stock-movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(movementForm),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Mouvement de stock echoue.");
      setSaving(false);
      return;
    }

    setMovementForm((prev) => ({
      ...prev,
      quantity: 1,
      referenceNumber: "",
      partnerName: "",
    }));
    await loadData();
    setSaving(false);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Produits et stock
          </h1>
          <p className="text-muted-foreground mt-1 text-sm lg:text-base">
            Entrée via facture fournisseur, sortie via bon de livraison.
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-input bg-background hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
        <div className="p-5 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Produits</p>
          </div>
          <p className="text-3xl font-bold font-mono">{products.length}</p>
        </div>
        <div className="p-5 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpFromLine className="h-4 w-4 text-emerald-500" />
            <p className="text-sm text-muted-foreground">Stock disponible</p>
          </div>
          <p className="text-3xl font-bold font-mono">{totalStock.toLocaleString("fr-FR")}</p>
        </div>
        <div className="p-5 rounded-xl bg-card border border-amber-500/30">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownToLine className="h-4 w-4 text-amber-500" />
            <p className="text-sm text-muted-foreground">Stock en attente</p>
          </div>
          <p className="text-3xl font-bold font-mono text-amber-500">{totalStockEnAttente.toLocaleString("fr-FR")}</p>
        </div>
        <div className="p-5 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Mouvements</p>
          </div>
          <p className="text-3xl font-bold font-mono">{movements.length}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleCreateProduct}
          className="space-y-4 rounded-xl border border-border bg-card p-5 lg:p-6"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Nouveau produit
          </h2>
          <input
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            placeholder="Nom produit"
            value={newProduct.name}
            onChange={(e) =>
              setNewProduct((prev) => ({ ...prev, name: e.target.value }))
            }
            required
          />
          <input
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            placeholder="SKU"
            value={newProduct.sku}
            onChange={(e) =>
              setNewProduct((prev) => ({ ...prev, sku: e.target.value }))
            }
            required
          />
          <input
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            placeholder="Fournisseur (optionnel)"
            value={newProduct.supplierName}
            onChange={(e) =>
              setNewProduct((prev) => ({ ...prev, supplierName: e.target.value }))
            }
          />
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Ajout..." : "Ajouter produit"}
          </button>
        </form>

        <form
          onSubmit={handleStockMovement}
          className="space-y-4 rounded-xl border border-border bg-card p-5 lg:p-6"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ArrowUpFromLine className="h-5 w-5" />
            Mouvement de stock
          </h2>
          <select
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            value={movementForm.productId}
            onChange={(e) =>
              setMovementForm((prev) => ({ ...prev, productId: e.target.value }))
            }
            required
          >
            <option value="">Selectionner un produit</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.sku}) - Dispo {product.stockQuantity} / Attente {product.stockEnAttente || 0}
              </option>
            ))}
          </select>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() =>
                setMovementForm((prev) => ({ ...prev, mode: "IN" }))
              }
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-colors border",
                movementForm.mode === "IN"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "border-input hover:bg-accent"
              )}
            >
              Entrée
            </button>
            <button
              type="button"
              onClick={() =>
                setMovementForm((prev) => ({ ...prev, mode: "OUT" }))
              }
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-colors border",
                movementForm.mode === "OUT"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                  : "border-input hover:bg-accent"
              )}
            >
              Sortie
            </button>
          </div>
          <input
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            type="number"
            min={1}
            value={movementForm.quantity}
            onChange={(e) =>
              setMovementForm((prev) => ({
                ...prev,
                quantity: Number(e.target.value) || 1,
              }))
            }
            required
          />
          <input
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            placeholder={
              movementForm.mode === "IN"
                ? "Numero facture achat"
                : "Numero bon livraison"
            }
            value={movementForm.referenceNumber}
            onChange={(e) =>
              setMovementForm((prev) => ({
                ...prev,
                referenceNumber: e.target.value,
              }))
            }
            required
          />
          <input
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            placeholder={
              movementForm.mode === "IN" ? "Nom fournisseur" : "Societe livraison"
            }
            value={movementForm.partnerName}
            onChange={(e) =>
              setMovementForm((prev) => ({ ...prev, partnerName: e.target.value }))
            }
            required
          />
          <button
            type="submit"
            disabled={saving || products.length === 0}
            className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Traitement..." : "Valider mouvement"}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="h-5 w-5" />
            Liste des produits
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Produit</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">SKU</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Stock</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">En attente</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Ventes</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Bénéfice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {products.map((product) => (
                <tr key={product.id} className="table-row-hover">
                  <td className="px-4 py-3">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.supplierName || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{product.sku}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      "font-mono font-bold",
                      product.stockQuantity === 0 ? "text-rose-500" :
                      product.stockQuantity < 5 ? "text-amber-500" : "text-emerald-500"
                    )}>
                      {product.stockQuantity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      "font-mono",
                      product.stockEnAttente > 0 ? "text-amber-500" : "text-muted-foreground"
                    )}>
                      {product.stockEnAttente || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {product.salesCount || 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-emerald-500">
                      {((product.revenue || 0) - (product.margin || 0)).toFixed(2)} DT
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {products.length === 0 && (
          <p className="text-muted-foreground text-center py-12">
            Aucun produit disponible. Ajoutez votre premier produit.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 lg:p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Minus className="h-5 w-5" />
          Historique mouvements
        </h2>
        <div className="space-y-3">
          {movements.map((movement) => (
            <div
              key={movement.id}
              className="flex items-center gap-4 rounded-lg border border-border px-4 py-3"
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  movement.type === "IN"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                )}
              >
                {movement.type === "IN" ? (
                  <ArrowUpFromLine className="h-5 w-5" />
                ) : (
                  <ArrowDownToLine className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {movement.type === "IN" ? "Entree" : "Sortie"} -{" "}
                  {movement.product.name}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {movement.type === "IN"
                    ? `Facture ${movement.purchaseInvoice?.invoiceNumber} / ${movement.purchaseInvoice?.supplierName}`
                    : `BL ${movement.deliveryNote?.noteNumber} / ${movement.deliveryNote?.companyName}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={cn(
                    "font-mono text-lg font-bold",
                    movement.type === "IN"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  )}
                >
                  {movement.type === "IN" ? "+" : "-"}
                  {movement.quantity}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(movement.createdAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>
          ))}
          {movements.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              Aucun mouvement enregistre.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}