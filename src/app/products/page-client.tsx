"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  FileText,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  stockEnAttente: number;
  supplierName: string | null;
  supplier: { id: string; name: string } | null;
  revenue: number;
  margin: number;
  salesCount: number;
};

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  _count?: {
    products: number;
    purchaseInvoices: number;
  };
};

type Movement = {
  id: string;
  type: "IN" | "OUT";
  quantity: number;
  unitCost: number | null;
  notes: string | null;
  createdAt: string;
  product: { name: string; sku: string };
  purchaseInvoice: {
    invoiceNumber: string;
    invoiceDate: string;
    supplierName: string;
    supplier: { id: string; name: string } | null;
  } | null;
  deliveryNote: {
    noteNumber: string;
    manifestDate: string;
    companyName: string;
    totalPackages: number;
  } | null;
};

type StockLine = {
  productId: string;
  quantity: number;
  unitCost?: number;
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyLine = (): StockLine => ({ productId: "", quantity: 1, unitCost: 0 });

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"stock" | "suppliers" | "history">("stock");

  const [newSupplier, setNewSupplier] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const [newProduct, setNewProduct] = useState({
    name: "",
    sku: "",
    supplierId: "",
  });
  const [purchaseForm, setPurchaseForm] = useState({
    invoiceNumber: "",
    invoiceDate: today(),
    supplierId: "",
    notes: "",
    lines: [emptyLine()],
  });
  const [manifestForm, setManifestForm] = useState({
    manifestNumber: "",
    manifestDate: today(),
    deliveryCompanyName: "",
    totalPackages: 1,
    notes: "",
    lines: [emptyLine()],
  });

  const totalStock = useMemo(
    () => products.reduce((sum, product) => sum + product.stockQuantity, 0),
    [products]
  );
  const totalStockEnAttente = useMemo(
    () => products.reduce((sum, product) => sum + (product.stockEnAttente || 0), 0),
    [products]
  );
  const manifestLineTotal = useMemo(
    () => manifestForm.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
    [manifestForm.lines]
  );

  const loadData = useCallback(async () => {
    setError("");
    const [productsRes, movementsRes, suppliersRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/stock-movements"),
      fetch("/api/suppliers"),
    ]);

    if (!productsRes.ok || !movementsRes.ok || !suppliersRes.ok) {
      setError("Impossible de charger les donnees stock.");
      return;
    }

    const [productsData, movementsData, suppliersData] = await Promise.all([
      productsRes.json(),
      movementsRes.json(),
      suppliersRes.json(),
    ]);

    setProducts(productsData);
    setMovements(movementsData);
    setSuppliers(suppliersData);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function resetMessages() {
    setError("");
    setSuccess("");
  }

  async function handleCreateSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();
    setSaving(true);

    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSupplier),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Creation fournisseur echouee.");
      setSaving(false);
      return;
    }

    setNewSupplier({ name: "", phone: "", email: "", address: "", notes: "" });
    setSuccess("Fournisseur ajoute.");
    await loadData();
    setSaving(false);
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();
    setSaving(true);

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

    setNewProduct({ name: "", sku: "", supplierId: "" });
    setSuccess("Produit ajoute.");
    await loadData();
    setSaving(false);
  }

  async function submitStockDocument(payload: unknown, successMessage: string) {
    resetMessages();
    setSaving(true);

    const res = await fetch("/api/stock-movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorPayload = await res.json().catch(() => ({}));
      setError(errorPayload.error ?? "Operation stock echouee.");
      setSaving(false);
      return;
    }

    setSuccess(successMessage);
    await loadData();
    setSaving(false);
  }

  async function handlePurchaseInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitStockDocument(
      {
        kind: "PURCHASE_INVOICE",
        ...purchaseForm,
        lines: purchaseForm.lines.filter((line) => line.productId && line.quantity > 0),
      },
      "Facture achat enregistree et stock augmente."
    );
    setPurchaseForm({
      invoiceNumber: "",
      invoiceDate: today(),
      supplierId: purchaseForm.supplierId,
      notes: "",
      lines: [emptyLine()],
    });
  }

  async function handleDeliveryManifest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitStockDocument(
      {
        kind: "DELIVERY_MANIFEST",
        ...manifestForm,
        lines: manifestForm.lines
          .filter((line) => line.productId && line.quantity > 0)
          .map(({ productId, quantity }) => ({ productId, quantity })),
      },
      "Manifeste livraison enregistre et stock diminue."
    );
    setManifestForm({
      manifestNumber: "",
      manifestDate: today(),
      deliveryCompanyName: manifestForm.deliveryCompanyName,
      totalPackages: 1,
      notes: "",
      lines: [emptyLine()],
    });
  }

  const updatePurchaseLine = (index: number, patch: Partial<StockLine>) => {
    setPurchaseForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      ),
    }));
  };

  const updateManifestLine = (index: number, patch: Partial<StockLine>) => {
    setManifestForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      ),
    }));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Produits et stock
          </h1>
          <p className="mt-1 text-sm text-muted-foreground lg:text-base">
            Entrees par factures fournisseurs, sorties par manifestes livraison.
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm transition-colors hover:bg-accent"
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
      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Package} label="Produits" value={products.length.toLocaleString("fr-FR")} />
        <Kpi
          icon={Building2}
          label="Fournisseurs"
          value={suppliers.length.toLocaleString("fr-FR")}
        />
        <Kpi
          icon={ArrowUpFromLine}
          label="Stock disponible"
          value={totalStock.toLocaleString("fr-FR")}
          tone="emerald"
        />
        <Kpi
          icon={ArrowDownToLine}
          label="Stock en attente"
          value={totalStockEnAttente.toLocaleString("fr-FR")}
          tone="amber"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["stock", "Stock"],
          ["suppliers", "Fournisseurs"],
          ["history", "Historique"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value as typeof activeTab)}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              activeTab === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-accent"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "stock" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Nouveau produit" icon={Plus}>
            <form onSubmit={handleCreateProduct} className="space-y-4">
              <TextInput
                placeholder="Nom produit"
                value={newProduct.name}
                onChange={(value) => setNewProduct((prev) => ({ ...prev, name: value }))}
                required
              />
              <TextInput
                placeholder="SKU"
                value={newProduct.sku}
                onChange={(value) => setNewProduct((prev) => ({ ...prev, sku: value }))}
                required
              />
              <SelectInput
                value={newProduct.supplierId}
                onChange={(value) =>
                  setNewProduct((prev) => ({ ...prev, supplierId: value }))
                }
              >
                <option value="">Fournisseur optionnel</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </SelectInput>
              <PrimaryButton disabled={saving}>
                {saving ? "Ajout..." : "Ajouter produit"}
              </PrimaryButton>
            </form>
          </Panel>

          <Panel title="Facture achat fournisseur" icon={FileText}>
            <form onSubmit={handlePurchaseInvoice} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  placeholder="Numero facture achat"
                  value={purchaseForm.invoiceNumber}
                  onChange={(value) =>
                    setPurchaseForm((prev) => ({ ...prev, invoiceNumber: value }))
                  }
                  required
                />
                <TextInput
                  type="date"
                  value={purchaseForm.invoiceDate}
                  onChange={(value) =>
                    setPurchaseForm((prev) => ({ ...prev, invoiceDate: value }))
                  }
                  required
                />
              </div>
              <SelectInput
                value={purchaseForm.supplierId}
                onChange={(value) =>
                  setPurchaseForm((prev) => ({ ...prev, supplierId: value }))
                }
                required
              >
                <option value="">Selectionner fournisseur</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </SelectInput>
              <StockLines
                products={products}
                lines={purchaseForm.lines}
                showUnitCost
                onChange={updatePurchaseLine}
                onAdd={() =>
                  setPurchaseForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }))
                }
                onRemove={(index) =>
                  setPurchaseForm((prev) => ({
                    ...prev,
                    lines: prev.lines.filter((_, lineIndex) => lineIndex !== index),
                  }))
                }
              />
              <TextInput
                placeholder="Notes facture optionnelles"
                value={purchaseForm.notes}
                onChange={(value) => setPurchaseForm((prev) => ({ ...prev, notes: value }))}
              />
              <PrimaryButton disabled={saving || suppliers.length === 0 || products.length === 0}>
                Enregistrer entree stock
              </PrimaryButton>
            </form>
          </Panel>

          <Panel title="Manifeste de livraison" icon={Truck}>
            <form onSubmit={handleDeliveryManifest} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  placeholder="Numero manifeste"
                  value={manifestForm.manifestNumber}
                  onChange={(value) =>
                    setManifestForm((prev) => ({ ...prev, manifestNumber: value }))
                  }
                  required
                />
                <TextInput
                  type="date"
                  value={manifestForm.manifestDate}
                  onChange={(value) =>
                    setManifestForm((prev) => ({ ...prev, manifestDate: value }))
                  }
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  placeholder="Societe de livraison"
                  value={manifestForm.deliveryCompanyName}
                  onChange={(value) =>
                    setManifestForm((prev) => ({ ...prev, deliveryCompanyName: value }))
                  }
                  required
                />
                <TextInput
                  type="number"
                  min={1}
                  value={String(manifestForm.totalPackages)}
                  onChange={(value) =>
                    setManifestForm((prev) => ({
                      ...prev,
                      totalPackages: Number(value) || 1,
                    }))
                  }
                  required
                />
              </div>
              <StockLines
                products={products}
                lines={manifestForm.lines}
                onChange={updateManifestLine}
                onAdd={() =>
                  setManifestForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }))
                }
                onRemove={(index) =>
                  setManifestForm((prev) => ({
                    ...prev,
                    lines: prev.lines.filter((_, lineIndex) => lineIndex !== index),
                  }))
                }
              />
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  manifestLineTotal === manifestForm.totalPackages
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                )}
              >
                Total lignes produits: {manifestLineTotal} / Nombre colis:{" "}
                {manifestForm.totalPackages}
              </div>
              <TextInput
                placeholder="Notes manifeste optionnelles"
                value={manifestForm.notes}
                onChange={(value) => setManifestForm((prev) => ({ ...prev, notes: value }))}
              />
              <PrimaryButton
                disabled={
                  saving ||
                  products.length === 0 ||
                  manifestLineTotal !== manifestForm.totalPackages
                }
              >
                Enregistrer sortie stock
              </PrimaryButton>
            </form>
          </Panel>

          <ProductsTable products={products} />
        </div>
      )}

      {activeTab === "suppliers" && (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <Panel title="Ajouter fournisseur" icon={Building2}>
            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <TextInput
                placeholder="Nom fournisseur"
                value={newSupplier.name}
                onChange={(value) => setNewSupplier((prev) => ({ ...prev, name: value }))}
                required
              />
              <TextInput
                placeholder="Telephone"
                value={newSupplier.phone}
                onChange={(value) => setNewSupplier((prev) => ({ ...prev, phone: value }))}
              />
              <TextInput
                type="email"
                placeholder="Email"
                value={newSupplier.email}
                onChange={(value) => setNewSupplier((prev) => ({ ...prev, email: value }))}
              />
              <TextInput
                placeholder="Adresse"
                value={newSupplier.address}
                onChange={(value) => setNewSupplier((prev) => ({ ...prev, address: value }))}
              />
              <TextInput
                placeholder="Notes"
                value={newSupplier.notes}
                onChange={(value) => setNewSupplier((prev) => ({ ...prev, notes: value }))}
              />
              <PrimaryButton disabled={saving}>
                {saving ? "Ajout..." : "Ajouter fournisseur"}
              </PrimaryButton>
            </form>
          </Panel>
          <SuppliersTable suppliers={suppliers} />
        </div>
      )}

      {activeTab === "history" && <MovementsList movements={movements} />}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "default" | "emerald" | "amber";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-2 flex items-center gap-2">
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "emerald" && "text-emerald-500",
            tone === "amber" && "text-amber-500",
            tone === "default" && "text-muted-foreground"
          )}
        />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="font-mono text-3xl font-bold">{value}</p>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 lg:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Icon className="h-5 w-5" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function TextInput({
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
    />
  );
}

function SelectInput({
  children,
  value,
  onChange,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
    >
      {children}
    </select>
  );
}

function PrimaryButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function StockLines({
  products,
  lines,
  showUnitCost = false,
  onChange,
  onAdd,
  onRemove,
}: {
  products: Product[];
  lines: StockLine[];
  showUnitCost?: boolean;
  onChange: (index: number, patch: Partial<StockLine>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      {lines.map((line, index) => (
        <div key={index} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_110px_110px_40px]">
          <SelectInput
            value={line.productId}
            onChange={(value) => onChange(index, { productId: value })}
            required
          >
            <option value="">Produit</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.sku}) - Stock {product.stockQuantity}
              </option>
            ))}
          </SelectInput>
          <TextInput
            type="number"
            min={1}
            value={String(line.quantity)}
            onChange={(value) => onChange(index, { quantity: Number(value) || 1 })}
            required
          />
          {showUnitCost ? (
            <TextInput
              type="number"
              min={0}
              step="0.001"
              placeholder="Prix achat"
              value={String(line.unitCost ?? 0)}
              onChange={(value) => onChange(index, { unitCost: Number(value) || 0 })}
            />
          ) : (
            <div className="hidden sm:block" />
          )}
          <button
            type="button"
            onClick={() => onRemove(index)}
            disabled={lines.length === 1}
            className="flex h-10 items-center justify-center rounded-lg border border-input text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
            aria-label="Supprimer ligne"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm transition-colors hover:bg-accent"
      >
        <Plus className="h-4 w-4" />
        Ajouter ligne produit
      </button>
    </div>
  );
}

function ProductsTable({ products }: { products: Product[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card xl:col-span-2">
      <div className="border-b border-border p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Package className="h-5 w-5" />
          Liste des produits
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <TableHead>Produit</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead align="right">Stock</TableHead>
              <TableHead align="right">En attente</TableHead>
              <TableHead align="right">Ventes</TableHead>
              <TableHead align="right">Benefice</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {products.map((product) => (
              <tr key={product.id} className="table-row-hover">
                <td className="px-4 py-3">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {product.supplier?.name || product.supplierName || "-"}
                  </p>
                </td>
                <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                  {product.sku}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={cn(
                      "font-mono font-bold",
                      product.stockQuantity === 0
                        ? "text-rose-500"
                        : product.stockQuantity < 5
                          ? "text-amber-500"
                          : "text-emerald-500"
                    )}
                  >
                    {product.stockQuantity}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                  {product.stockEnAttente || "-"}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {product.salesCount || 0}
                </td>
                <td className="px-4 py-3 text-right font-mono text-emerald-500">
                  {((product.revenue || 0) - (product.margin || 0)).toFixed(2)} DT
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {products.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          Aucun produit disponible.
        </p>
      )}
    </section>
  );
}

function SuppliersTable({ suppliers }: { suppliers: Supplier[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Building2 className="h-5 w-5" />
          Liste fournisseurs
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead align="right">Produits</TableHead>
              <TableHead align="right">Factures</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {suppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{supplier.name}</p>
                  <p className="text-xs text-muted-foreground">{supplier.address || "-"}</p>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  <p>{supplier.phone || "-"}</p>
                  <p>{supplier.email || "-"}</p>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {supplier._count?.products ?? 0}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {supplier._count?.purchaseInvoices ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {suppliers.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          Aucun fournisseur enregistre.
        </p>
      )}
    </section>
  );
}

function MovementsList({ movements }: { movements: Movement[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 lg:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
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
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
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
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {movement.type === "IN" ? "Entree" : "Sortie"} - {movement.product.name}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {movement.type === "IN"
                  ? `Facture ${movement.purchaseInvoice?.invoiceNumber ?? "-"} / ${
                      movement.purchaseInvoice?.supplier?.name ??
                      movement.purchaseInvoice?.supplierName ??
                      "-"
                    }`
                  : `Manifeste ${movement.deliveryNote?.noteNumber ?? "-"} / ${
                      movement.deliveryNote?.companyName ?? "-"
                    }`}
              </p>
            </div>
            <div className="shrink-0 text-right">
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
          <p className="py-8 text-center text-muted-foreground">
            Aucun mouvement enregistre.
          </p>
        )}
      </div>
    </section>
  );
}

function TableHead({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-sm font-medium text-muted-foreground",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}
