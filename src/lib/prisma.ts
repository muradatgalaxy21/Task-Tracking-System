import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

// globalThis persists across Next.js hot-reloads in dev, preventing multiple PrismaClient instances
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Connect to Turso via the libSQL driver and attach the adapter for Prisma
const libsql = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const adapter = new PrismaLibSQL(libsql);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ adapter });

// Cache the instance on globalThis in development to prevent multiple clients on hot-reload
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
