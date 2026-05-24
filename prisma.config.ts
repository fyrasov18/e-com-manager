// prisma.config.ts — Configuration Prisma pour Jody Shop
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"] || "postgresql://postgres:postgres@localhost:5432/jodyshop?schema=public",
  },
});
