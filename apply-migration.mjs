import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { config } from "dotenv";

// Load environment variables from .env.local
config({ path: ".env.local" });

// 1. Retrieve the database URL and credentials from the loaded configuration.
// 2. Adjust relative database URL to target the correct database file path.
let url = process.env.DATABASE_URL;
if (url === "file:./dev.db" || url === "file:dev.db") {
  url = "file:./prisma/dev.db";
}
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("DATABASE_URL or TURSO_AUTH_TOKEN is not set in .env.local");
  process.exit(1);
}

const client = createClient({ url, authToken });

// Read the generated SQL migration file
const sql = readFileSync("migration.sql", "utf8");

// Split into individual statements and filter out empty lines
const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Applying ${statements.length} statements to ${url} ...`);

for (const statement of statements) {
  await client.execute(statement);
  console.log("OK:", statement.slice(0, 60).replace(/\n/g, " ") + "...");
}

console.log("Migration applied successfully.");
