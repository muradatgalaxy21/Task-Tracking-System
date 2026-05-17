import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// globalThis persists across Next.js hot-reloads in dev, preventing multiple PrismaClient instances
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
  // In production, pass config directly to PrismaLibSQL — v6 does not accept a pre-built Client
  if (process.env.NODE_ENV === "production") {
    const adapter = new PrismaLibSQL({
      url: process.env.DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }
  // In development, fall back to local SQLite file
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Only cache on globalThis in development; production serverless functions do not hot-reload
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
