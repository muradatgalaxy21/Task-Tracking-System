import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const adapter = new PrismaLibSQL({
    url: process.env.DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const prisma = new PrismaClient({ adapter });
  console.log("Connecting...");
  const users = await prisma.user.findMany();
  console.log(users);
}
main().catch(console.error);
