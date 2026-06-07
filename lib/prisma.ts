import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createClient() {
  // Prefer a local dev DB when available so frontend-only work doesn't hit prod.
  // Set LOCAL_DATABASE_URL in a local .env (gitignored) to use a safe local DB.
  const connectionString =
    process.env.NODE_ENV !== "production"
      ? process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL!
      : process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
