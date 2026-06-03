-- Suppliers scoped by organisation
CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "teamId" TEXT NOT NULL,

  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Supplier_teamId_name_key" ON "Supplier"("teamId", "name");
CREATE INDEX "Supplier_teamId_idx" ON "Supplier"("teamId");

-- Products can now reference a supplier while preserving legacy supplierName text.
ALTER TABLE "Product" ADD COLUMN "supplierId" TEXT;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Product_teamId_idx" ON "Product"("teamId");
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");

-- Purchase invoices become multi-line through StockMovement rows and are unique per organisation.
ALTER TABLE "PurchaseInvoice" ADD COLUMN "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "supplierId" TEXT;

ALTER TABLE "PurchaseInvoice"
  ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "PurchaseInvoice_invoiceNumber_key";
CREATE UNIQUE INDEX "PurchaseInvoice_teamId_invoiceNumber_key" ON "PurchaseInvoice"("teamId", "invoiceNumber");
CREATE INDEX "PurchaseInvoice_supplierId_idx" ON "PurchaseInvoice"("supplierId");

-- Delivery notes are used as delivery manifests with date and total package count.
ALTER TABLE "DeliveryNote" ADD COLUMN "manifestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DeliveryNote" ADD COLUMN "totalPackages" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "DeliveryNote_noteNumber_key";
CREATE UNIQUE INDEX "DeliveryNote_teamId_noteNumber_key" ON "DeliveryNote"("teamId", "noteNumber");

-- Movement lines carry optional purchase unit cost and notes.
ALTER TABLE "StockMovement" ADD COLUMN "unitCost" DOUBLE PRECISION;
ALTER TABLE "StockMovement" ADD COLUMN "notes" TEXT;

CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");
CREATE INDEX "StockMovement_purchaseInvoiceId_idx" ON "StockMovement"("purchaseInvoiceId");
CREATE INDEX "StockMovement_deliveryNoteId_idx" ON "StockMovement"("deliveryNoteId");
