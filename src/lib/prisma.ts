import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// globalThis persists across Next.js hot-reloads in dev, preventing multiple PrismaClient instances
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 1. Retrieve the database URL from the environment configuration.
// 2. Map relative SQLite database URLs to the prisma directory to match Prisma CLI's resolution.
// 3. This ensures both Next.js and Prisma CLI connect to the same SQLite database file.
let databaseUrl = process.env.DATABASE_URL!;
if (databaseUrl === "file:./dev.db" || databaseUrl === "file:dev.db") {
  databaseUrl = "file:./prisma/dev.db";
}

// Pass config object directly — avoids the separate createClient import and resolves the type mismatch on Vercel
const adapter = new PrismaLibSQL({
  url: databaseUrl,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ adapter });

// Cache the instance on globalThis in development to prevent multiple clients on hot-reload
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
