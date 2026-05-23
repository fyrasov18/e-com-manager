ALTER TABLE "Expense" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Expense" ADD COLUMN "amountUsd" DOUBLE PRECISION;
ALTER TABLE "Expense" ADD COLUMN "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "Expense" ADD COLUMN "amountTnd" DOUBLE PRECISION;
ALTER TABLE "Expense" ADD COLUMN "createdById" TEXT;

UPDATE "Expense"
SET "amountTnd" = "amount"
WHERE "amountTnd" IS NULL;

CREATE INDEX "Expense_teamId_source_startDate_idx" ON "Expense"("teamId", "source", "startDate");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");

ALTER TABLE "Expense"
ADD CONSTRAINT "Expense_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
