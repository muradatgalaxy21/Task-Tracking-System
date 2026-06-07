import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  // 1. Load the database URL environment variable.
  // 2. Adjust relative database URL to target the correct database file path.
  // 3. Construct the LibSQL client adapter using the adjusted URL.
  let databaseUrl = process.env.DATABASE_URL!;
  if (databaseUrl === "file:./dev.db" || databaseUrl === "file:dev.db") {
    databaseUrl = "file:./prisma/dev.db";
  }
  const adapter = new PrismaLibSQL({
    url: databaseUrl,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const prisma = new PrismaClient({ adapter });
  console.log("Connecting...");
  const users = await prisma.user.findMany();
  console.log(users);
}
main().catch(console.error);
