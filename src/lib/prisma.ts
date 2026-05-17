import { PrismaClient } from "@prisma/client";

// globalThis persists across Next.js hot-reloads in dev, preventing multiple PrismaClient instances
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// Only cache on globalThis in development; production serverless functions do not hot-reload
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
