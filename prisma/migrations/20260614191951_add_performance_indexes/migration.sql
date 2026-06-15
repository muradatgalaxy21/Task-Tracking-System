-- CreateIndex
CREATE INDEX "DailyAttendance_date_idx" ON "DailyAttendance"("date");

-- CreateIndex
CREATE INDEX "MemberMonthlyPayout_close_id_user_id_idx" ON "MemberMonthlyPayout"("close_id", "user_id");

-- CreateIndex
CREATE INDEX "MemberMonthlyPayout_workspace_id_user_id_idx" ON "MemberMonthlyPayout"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "TaskLedger_workspace_id_status_idx" ON "TaskLedger"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "TaskLedger_workspace_id_assignee_id_idx" ON "TaskLedger"("workspace_id", "assignee_id");

-- CreateIndex
CREATE INDEX "TaskLedger_status_max_deadline_idx" ON "TaskLedger"("status", "max_deadline");
