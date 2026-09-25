import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env";
import { PrismaClient } from "../generated/prisma/client";

// One client, and therefore one connection pool, shared by the whole process.
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
});

export const prisma = new PrismaClient({ adapter });
