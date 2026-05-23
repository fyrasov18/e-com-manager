-- Add withholding tax settings and applied amounts for delivery finance.
ALTER TABLE "DeliveryCompanySetting"
ADD COLUMN IF NOT EXISTS "withholdingTaxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "withholdingTaxApplied" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "DeliveryRevenue"
ADD COLUMN IF NOT EXISTS "withholdingTaxApplied" DOUBLE PRECISION NOT NULL DEFAULT 0;
