-- Organisation-scoped roles and membership assignments.

ALTER TABLE "Membership" ADD COLUMN "roleId" TEXT;

CREATE TABLE "WorkspaceRole" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceRole_teamId_name_key" ON "WorkspaceRole"("teamId", "name");
CREATE INDEX "WorkspaceRole_teamId_isOwner_idx" ON "WorkspaceRole"("teamId", "isOwner");
CREATE INDEX "WorkspaceRole_teamId_isSystem_idx" ON "WorkspaceRole"("teamId", "isSystem");
CREATE INDEX "Membership_roleId_idx" ON "Membership"("roleId");

ALTER TABLE "WorkspaceRole" ADD CONSTRAINT "WorkspaceRole_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "WorkspaceRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "WorkspaceRole" ("id", "teamId", "name", "description", "permissions", "isSystem", "isOwner")
SELECT
  'role_owner_' || replace(t."id", '-', ''),
  t."id",
  'Owner',
  'Full protected access to the organisation.',
  '["admin:all"]',
  true,
  true
FROM "Team" t
ON CONFLICT ("teamId", "name") DO NOTHING;

INSERT INTO "WorkspaceRole" ("id", "teamId", "name", "description", "permissions", "isSystem", "isOwner")
SELECT
  'role_manager_' || replace(t."id", '-', ''),
  t."id",
  'Manager',
  'Operational access for orders, products, finance, delivery and tasks.',
  '["dashboard:read","reports:read","orders:read","orders:write","products:read","products:write","finance:read","finance:write","expenses:read","expenses:write","tasks:read","tasks:write","goals:read","goals:write","imports:write","delivery:read","delivery:write","profile:read"]',
  false,
  false
FROM "Team" t
ON CONFLICT ("teamId", "name") DO NOTHING;

INSERT INTO "WorkspaceRole" ("id", "teamId", "name", "description", "permissions", "isSystem", "isOwner")
SELECT
  'role_member_' || replace(t."id", '-', ''),
  t."id",
  'Membre',
  'Basic access for finance and expenses visibility.',
  '["dashboard:read","finance:read","expenses:read","profile:read"]',
  false,
  false
FROM "Team" t
ON CONFLICT ("teamId", "name") DO NOTHING;

UPDATE "Membership" m
SET "roleId" = CASE
  WHEN lower(m."role") IN ('owner', 'admin') THEN 'role_owner_' || replace(m."teamId", '-', '')
  WHEN lower(m."role") = 'manager' THEN 'role_manager_' || replace(m."teamId", '-', '')
  ELSE 'role_member_' || replace(m."teamId", '-', '')
END
WHERE m."roleId" IS NULL;
