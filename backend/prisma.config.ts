import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env itself. Use Node's built-in loader (no dotenv).
// In Docker/CI there is no .env file; DATABASE_URL comes from the environment.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // process.env (not Prisma's env() helper) so `prisma generate` works without a DB URL,
    // e.g. during the Docker build. Commands that need the DB fail with a clear error.
    url: process.env["DATABASE_URL"],
  },
});
