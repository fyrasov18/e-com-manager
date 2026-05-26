-- Add stable import identity for idempotent expense imports.
ALTER TABLE "Expense" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX "expense_import_identity" ON "Expense"("teamId", "source", "externalId");
