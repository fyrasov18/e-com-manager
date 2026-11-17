-- 1. Add teamId column as nullable first
ALTER TABLE "DeliveryCompanySetting" ADD COLUMN IF NOT EXISTS "teamId" TEXT;

-- 2. Drop the global unique constraint on provider FIRST (so we can store the same provider for multiple teams)
DROP INDEX IF EXISTS "DeliveryCompanySetting_provider_key";

-- 3. Populate teamId for existing records with the default/main team
DO $$
DECLARE
    main_team_id TEXT;
    team_rec RECORD;
    setting_rec RECORD;
BEGIN
    SELECT "id" INTO main_team_id FROM "Team" WHERE "id" = '353e9428-00b0-4e6f-be27-5d450de70cdc';
    IF main_team_id IS NULL THEN
        SELECT "id" INTO main_team_id FROM "Team" ORDER BY "createdAt" ASC LIMIT 1;
    END IF;

    -- Update existing records without teamId
    UPDATE "DeliveryCompanySetting" SET "teamId" = main_team_id WHERE "teamId" IS NULL;

    -- Replicate existing baseline settings to all other existing teams so every workspace has its own configuration
    IF main_team_id IS NOT NULL THEN
        FOR team_rec IN SELECT "id" FROM "Team" WHERE "id" != main_team_id LOOP
            FOR setting_rec IN SELECT "provider", "deliveryCost", "returnCost", "withholdingTaxPercent", "isActive"
                               FROM "DeliveryCompanySetting" WHERE "teamId" = main_team_id LOOP
                IF NOT EXISTS (
                    SELECT 1 FROM "DeliveryCompanySetting"
                    WHERE "teamId" = team_rec."id" AND "provider" = setting_rec."provider"
                ) THEN
                    INSERT INTO "DeliveryCompanySetting" ("id", "teamId", "provider", "deliveryCost", "returnCost", "withholdingTaxPercent", "isActive", "createdAt", "updatedAt")
                    VALUES (gen_random_uuid(), team_rec."id", setting_rec."provider", setting_rec."deliveryCost", setting_rec."returnCost", setting_rec."withholdingTaxPercent", setting_rec."isActive", NOW(), NOW());
                END IF;
            END LOOP;
        END LOOP;
    END IF;
END $$;

-- 4. Set teamId NOT NULL
ALTER TABLE "DeliveryCompanySetting" ALTER COLUMN "teamId" SET NOT NULL;

-- 5. Add Foreign Key relation to Team with ON DELETE CASCADE
ALTER TABLE "DeliveryCompanySetting" 
DROP CONSTRAINT IF EXISTS "DeliveryCompanySetting_teamId_fkey";

ALTER TABLE "DeliveryCompanySetting" 
ADD CONSTRAINT "DeliveryCompanySetting_teamId_fkey" 
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Add composite unique constraint [teamId, provider]
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryCompanySetting_teamId_provider_key" 
ON "DeliveryCompanySetting"("teamId", "provider");

-- 7. Add index on teamId
CREATE INDEX IF NOT EXISTS "DeliveryCompanySetting_teamId_idx" 
ON "DeliveryCompanySetting"("teamId");
