UPDATE "User"
SET "role" = 'USER'
WHERE "role" IN ('VIEWER', 'viewer');

UPDATE "User"
SET "role" = 'admin'
WHERE "role" = 'ADMIN';

UPDATE "User"
SET "role" = 'manager'
WHERE "role" = 'MANAGER';

UPDATE "User"
SET "role" = 'user'
WHERE "role" = 'USER';

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'user';
