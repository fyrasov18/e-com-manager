ALTER TABLE "Order"
ADD COLUMN "workspaceId" TEXT,
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "isManualOrder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deliveryType" TEXT,
ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "notes" TEXT,
ADD COLUMN "productName" TEXT;

UPDATE "Order"
SET "workspaceId" = "teamId"
WHERE "workspaceId" IS NULL;

ALTER TABLE "Order"
ADD CONSTRAINT "Order_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Order_workspaceId_idx" ON "Order"("workspaceId");
CREATE INDEX "Order_createdByUserId_idx" ON "Order"("createdByUserId");
CREATE INDEX "Order_isManualOrder_idx" ON "Order"("isManualOrder");
CREATE INDEX "Order_deliveryType_idx" ON "Order"("deliveryType");
