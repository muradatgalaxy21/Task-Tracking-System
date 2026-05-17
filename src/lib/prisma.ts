import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

// globalThis persists across Next.js hot-reloads in dev, preventing multiple PrismaClient instances
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
  // In production, connect to Turso via the libsql HTTP adapter
  if (process.env.NODE_ENV === "production") {
    const libsql = createClient({
      url: process.env.DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({ adapter });
  }
  // In development, fall back to local SQLite file
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Only cache on globalThis in development; production serverless functions do not hot-reload
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
