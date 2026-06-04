-- CreateTable
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
);

-- CreateTable
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
    "present_days" INTEGER NOT NULL DEFAULT 0,
    "scheduled_days" INTEGER NOT NULL DEFAULT 25,
    "multiplier_overrides" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberMonthlyPayout_close_id_fkey" FOREIGN KEY ("close_id") REFERENCES "MonthlyClose" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyClose_workspace_id_month_year_key" ON "MonthlyClose"("workspace_id", "month", "year");
