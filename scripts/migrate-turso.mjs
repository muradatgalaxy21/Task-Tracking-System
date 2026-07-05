import { readFileSync } from "fs";
import { createClient } from "@libsql/client";

async function main() {
  console.log("Starting Turso schema migration...");

  // 1. Load the raw content of the local environment file.
  // 2. Read the local environment variables file synchronously.
  let envContent;
  try {
    envContent = readFileSync(".env.local", "utf8");
  } catch (err) {
    console.error("Failed to read .env.local file:", err.message);
    process.exit(1);
  }

  // 1. Extract the remote Turso database URL matching a libsql protocol.
  // 2. Extract the corresponding Turso authentication token from env variables.
  const urlMatch = envContent.match(/DATABASE_URL\s*=\s*["'](libsql:\/\/[^"']+)["']/);
  const tokenMatch = envContent.match(/TURSO_AUTH_TOKEN\s*=\s*["']([^"']+)["']/);

  if (!urlMatch) {
    console.error("Error: Could not find Turso DATABASE_URL in .env.local");
    process.exit(1);
  }
  if (!tokenMatch) {
    console.error("Error: Could not find TURSO_AUTH_TOKEN in .env.local");
    process.exit(1);
  }

  const url = urlMatch[1];
  const authToken = tokenMatch[1];

  console.log(`Connecting to database: ${url}`);

  // 1. Create a Turso client using the parsed URL and token.
  // 2. Establish connection config to perform queries on the remote server.
  let client;
  try {
    client = createClient({ url, authToken });
  } catch (err) {
    console.error("Failed to initialize database client:", err.message);
    process.exit(1);
  }

  // 1. Execute SQL statement using the database client.
  // 2. Handle success and throw detailed errors on statement failure.
  async function runSQL(sql, description) {
    try {
      console.log(`Executing: ${description}`);
      await client.execute(sql);
      console.log(`Success: ${description}`);
    } catch (err) {
      console.error(`Error executing ${description}:`, err.message);
      throw err;
    }
  }

  try {
    // 1. Query the master table schema from SQLite.
    // 2. Extract and format the list of existing table names in the remote database.
    const tablesResult = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
    const tables = tablesResult.rows.map(row => row.name);
    console.log("Current tables in database:", tables);

    // 1. Check if the AccountDeletionToken table exists.
    // 2. Create the AccountDeletionToken table if it is missing.
    // 3. Create unique indexes for user_id and token fields.
    if (!tables.includes("AccountDeletionToken")) {
      const createAccountDeletionToken = `
        CREATE TABLE "AccountDeletionToken" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "user_id" TEXT NOT NULL,
          "token" TEXT NOT NULL,
          "payload" TEXT NOT NULL,
          "expires_at" DATETIME NOT NULL,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;
      const createIdxUserId = `CREATE UNIQUE INDEX "AccountDeletionToken_user_id_key" ON "AccountDeletionToken"("user_id")`;
      const createIdxToken = `CREATE UNIQUE INDEX "AccountDeletionToken_token_key" ON "AccountDeletionToken"("token")`;

      await runSQL(createAccountDeletionToken, "Create AccountDeletionToken table");
      await runSQL(createIdxUserId, "Create unique index on AccountDeletionToken(user_id)");
      await runSQL(createIdxToken, "Create unique index on AccountDeletionToken(token)");
    } else {
      console.log("AccountDeletionToken table already exists.");
    }

    // 1. Check if the MonthlyClose table exists.
    // 2. Create the MonthlyClose table if it is missing.
    // 3. Create a unique constraint index on workspace_id, month, and year.
    if (!tables.includes("MonthlyClose")) {
      const createMonthlyClose = `
        CREATE TABLE "MonthlyClose" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "workspace_id" TEXT NOT NULL,
          "label" TEXT NOT NULL,
          "month" INTEGER NOT NULL,
          "year" INTEGER NOT NULL,
          "period_end" DATETIME NOT NULL,
          "total_revenue" REAL NOT NULL DEFAULT 0,
          "scheduled_days" INTEGER NOT NULL DEFAULT 25,
          "status" TEXT NOT NULL DEFAULT 'Draft',
          "created_by" TEXT NOT NULL,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "finalized_at" DATETIME,
          CONSTRAINT "MonthlyClose_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `;
      const createIdxMonthlyCloseUnique = `
        CREATE UNIQUE INDEX "MonthlyClose_workspace_id_month_year_key" ON "MonthlyClose"("workspace_id", "month", "year")
      `;

      await runSQL(createMonthlyClose, "Create MonthlyClose table");
      await runSQL(createIdxMonthlyCloseUnique, "Create unique index on MonthlyClose(workspace_id, month, year)");
    } else {
      console.log("MonthlyClose table already exists.");
    }

    // 1. Check if the MemberMonthlyPayout table exists.
    // 2. Create the MemberMonthlyPayout table if it is missing.
    if (!tables.includes("MemberMonthlyPayout")) {
      const createMemberMonthlyPayout = `
        CREATE TABLE "MemberMonthlyPayout" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "close_id" TEXT NOT NULL,
          "workspace_id" TEXT NOT NULL,
          "user_id" TEXT NOT NULL,
          "tps_score" REAL NOT NULL DEFAULT 0,
          "as_score" REAL NOT NULL DEFAULT 0,
          "total_score" REAL NOT NULL DEFAULT 0,
          "base_payout" REAL NOT NULL DEFAULT 0,
          "perf_payout" REAL NOT NULL DEFAULT 0,
          "final_payout" REAL NOT NULL DEFAULT 0,
          "present_days" REAL NOT NULL DEFAULT 0,
          "scheduled_days" INTEGER NOT NULL DEFAULT 25,
          "multiplier_overrides" TEXT NOT NULL DEFAULT '{}',
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "MemberMonthlyPayout_close_id_fkey" FOREIGN KEY ("close_id") REFERENCES "MonthlyClose" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `;

      await runSQL(createMemberMonthlyPayout, "Create MemberMonthlyPayout table");
    } else {
      console.log("MemberMonthlyPayout table already exists.");
    }

    // 1. Query the User table schema using PRAGMA.
    // 2. Check if the accepted_privacy_policy column is present in the table.
    // 3. Alter the table to add the column if it is missing.
    const userInfoResult = await client.execute("PRAGMA table_info(User)");
    const userColumns = userInfoResult.rows.map(row => row.name);
    if (!userColumns.includes("accepted_privacy_policy")) {
      const addColumnSql = `ALTER TABLE "User" ADD COLUMN "accepted_privacy_policy" BOOLEAN NOT NULL DEFAULT false`;
      await runSQL(addColumnSql, "Add accepted_privacy_policy column to User table");
    } else {
      console.log("accepted_privacy_policy column already exists on User table.");
    }

    // 1. Define missing performance indexes.
    // 2. Iterate through each index definition.
    // 3. Run execution queries safely, ignoring errors if indexes already exist.
    const indexes = [
      { name: "DailyAttendance_date_idx", sql: `CREATE INDEX "DailyAttendance_date_idx" ON "DailyAttendance"("date")` },
      { name: "MemberMonthlyPayout_close_id_user_id_idx", sql: `CREATE INDEX "MemberMonthlyPayout_close_id_user_id_idx" ON "MemberMonthlyPayout"("close_id", "user_id")` },
      { name: "MemberMonthlyPayout_workspace_id_user_id_idx", sql: `CREATE INDEX "MemberMonthlyPayout_workspace_id_user_id_idx" ON "MemberMonthlyPayout"("workspace_id", "user_id")` },
      { name: "TaskLedger_workspace_id_status_idx", sql: `CREATE INDEX "TaskLedger_workspace_id_status_idx" ON "TaskLedger"("workspace_id", "status")` },
      { name: "TaskLedger_workspace_id_assignee_id_idx", sql: `CREATE INDEX "TaskLedger_workspace_id_assignee_id_idx" ON "TaskLedger"("workspace_id", "assignee_id")` },
      { name: "TaskLedger_status_max_deadline_idx", sql: `CREATE INDEX "TaskLedger_status_max_deadline_idx" ON "TaskLedger"("status", "max_deadline")` }
    ];

    for (const index of indexes) {
      try {
        await runSQL(index.sql, `Create index ${index.name}`);
      } catch (err) {
        if (err.message.includes("already exists")) {
          console.log(`Index ${index.name} already exists, skipping.`);
        } else {
          throw err;
        }
      }
    }

    // 1. Check if the EmailChangeToken table exists in the database.
    // 2. Create the EmailChangeToken table if it is missing.
    // 3. Create a unique index on the token field.
    if (!tables.includes("EmailChangeToken")) {
      const createEmailChangeToken = `
        CREATE TABLE "EmailChangeToken" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "user_id" TEXT NOT NULL,
          "token" TEXT NOT NULL,
          "new_email" TEXT NOT NULL,
          "expires_at" DATETIME NOT NULL,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;
      const createIdxToken = `CREATE UNIQUE INDEX "EmailChangeToken_token_key" ON "EmailChangeToken"("token")`;

      await runSQL(createEmailChangeToken, "Create EmailChangeToken table");
      await runSQL(createIdxToken, "Create unique index on EmailChangeToken(token)");
    } else {
      console.log("EmailChangeToken table already exists.");
    }

    // 1. Check if the Announcement table exists in the database.
    // 2. Create the Announcement table if it is missing with foreign key constraints.
    if (!tables.includes("Announcement")) {
      const createAnnouncement = `
        CREATE TABLE "Announcement" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "workspace_id" TEXT,
          "user_id" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "type" TEXT NOT NULL DEFAULT 'info',
          "active" BOOLEAN NOT NULL DEFAULT true,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expires_at" DATETIME,
          CONSTRAINT "Announcement_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "Announcement_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `;

      await runSQL(createAnnouncement, "Create Announcement table");
    } else {
      console.log("Announcement table already exists.");
    }

    // 1. Add the password_changed_at column to User if missing.
    // 2. Used to invalidate JWTs issued before a password reset.
    if (!userColumns.includes("password_changed_at")) {
      const addPwChangedSql = `ALTER TABLE "User" ADD COLUMN "password_changed_at" DATETIME`;
      await runSQL(addPwChangedSql, "Add password_changed_at column to User table");
    } else {
      console.log("password_changed_at column already exists on User table.");
    }

    // 1. Check if the RateLimit table exists.
    // 2. Create it if missing (backs the DB-backed auth rate limiter).
    // 3. Add an index on expires_at for cheap cleanup of stale windows.
    if (!tables.includes("RateLimit")) {
      const createRateLimit = `
        CREATE TABLE "RateLimit" (
          "key" TEXT NOT NULL PRIMARY KEY,
          "count" INTEGER NOT NULL DEFAULT 0,
          "expires_at" DATETIME NOT NULL
        )
      `;
      const createIdxExpires = `CREATE INDEX "RateLimit_expires_at_idx" ON "RateLimit"("expires_at")`;

      await runSQL(createRateLimit, "Create RateLimit table");
      await runSQL(createIdxExpires, "Create index on RateLimit(expires_at)");
    } else {
      console.log("RateLimit table already exists.");
    }

    console.log("Migration completed successfully.");

  } catch (err) {
    console.error("Migration failed with error:", err.message);
    process.exit(1);
  }
}

main();
