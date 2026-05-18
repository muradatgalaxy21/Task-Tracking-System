# Post-Deployment Testing Checklist

**Testing Order:** Simple → Advanced → Edge Cases → Security  
**Legend:** `[ ]` = pending · `[x]` = passed · `[!]` = bug found

---

## Phase 1 — Authentication & Onboarding

### 1.1 Login Flow
- [ ] **T-001** Open `/login` — split-screen layout loads correctly, no console errors
- [ ] **T-002** Enter a **new email** → page shows onboarding choice (Create Workspace / Join Team)
- [ ] **T-003** Enter your **existing email** → page skips onboarding, goes straight to password
- [ ] **T-004** Login with correct credentials → redirected to `/dashboard`
- [ ] **T-005** Login with wrong password → error message shown, no crash
- [ ] **T-006** Leave email blank → submit → validation error shown
- [ ] **T-007** Logout → redirected to `/login`, cannot access `/dashboard` via back button

### 1.2 Magic Link (Email Login)
- [ ] **T-008** Click "Magic Link" / passwordless option → email sent confirmation shown
- [ ] **T-009** Open magic link from email → lands on dashboard authenticated

### 1.3 OAuth (if configured)
- [ ] **T-010** Google OAuth button visible only when `GOOGLE_CLIENT_ID` is set
- [ ] **T-011** GitHub OAuth button visible only when `GITHUB_ID` is set

### 1.4 Password Reset
- [ ] **T-012** Go to `/auth/forgot-password` → enter email → success message
- [ ] **T-013** Open reset link from email → `/auth/reset-password` → set new password → login works

### 1.5 Signup / New User Onboarding
- [ ] **T-014** New user chooses "Create Workspace" → workspace created, user gets `Owner` role
- [ ] **T-015** New user chooses "Join Team" → enters valid invite code → joins workspace as `Member`
- [ ] **T-016** New user enters invalid/expired invite code → clear error message

---

## Phase 2 — Dashboard & Navigation

### 2.1 Initial Load
- [ ] **T-017** `/dashboard` loads without errors — stats cards visible
- [ ] **T-018** Sidebar shows correct nav items: Tasks, Attendance, Ledger, Payout, Settings
- [ ] **T-019** Sidebar shows active workspace name in workspace switcher
- [ ] **T-020** Notification bell icon visible in sidebar

### 2.2 Workspace Switcher
- [ ] **T-021** Click workspace switcher → dropdown shows all user's workspaces
- [ ] **T-022** Switch to a different workspace → task list and data updates accordingly
- [ ] **T-023** Tasks from Workspace A do NOT appear when Workspace B is active (isolation check)

### 2.3 Join or Create Workspace Modal
- [ ] **T-024** Click "Join or Create a Workspace" → modal opens with two tabs
- [ ] **T-025** As Member/Guest → "Create new" tab is hidden, only "Join via invite code" visible
- [ ] **T-026** As Admin/Owner → both tabs visible
- [ ] **T-027** Enter valid invite code → join workspace → sidebar workspace list updates
- [ ] **T-028** Create new workspace (as Admin/Owner) → appears in switcher immediately

---

## Phase 3 — Task Management

### 3.1 Creating Tasks
- [ ] **T-029** Click "New Task" / create button → task creation form opens
- [ ] **T-030** Fill all fields (title, description, assignee, priority, deadline) → task created
- [ ] **T-031** Create task with only required fields → succeeds
- [ ] **T-032** Submit with no title → validation error, task not created
- [ ] **T-033** Created task appears in Kanban "Backlog" column (Todo = Backlog label)

### 3.2 Kanban View
- [ ] **T-034** Kanban board shows 4 columns: Backlog · In Progress · Review · Completed
- [ ] **T-035** Tasks display correct priority badge (Urgent / High / Medium / Low)
- [ ] **T-036** "Assigned to Me" filter chip → only current user's tasks shown
- [ ] **T-037** "High Priority" filter chip → only High + Urgent tasks shown
- [ ] **T-038** "Due Today" filter chip → only tasks due today shown
- [ ] **T-039** Search bar → filters tasks by title in real time

### 3.3 List View
- [ ] **T-040** Toggle to List view → dense table renders all tasks
- [ ] **T-041** Filters work identically in list view
- [ ] **T-042** Column headers sort tasks when clicked (if sortable)

### 3.4 Task Detail Panel
- [ ] **T-043** Click a task → detail panel opens on the right
- [ ] **T-044** Panel shows: title, description, assignee, priority, deadline, status, sub-tasks, activity feed
- [ ] **T-045** Edit title → save → update reflected immediately
- [ ] **T-046** Edit description → save → update persists on refresh
- [ ] **T-047** Change priority → saved correctly
- [ ] **T-048** Add a comment in activity feed → comment appears with actor name and timestamp
- [ ] **T-049** Mention a teammate with `@firstname` in a comment → notification appears for that user

### 3.5 Sub-Tasks
- [ ] **T-050** Add a sub-task → appears under parent task in panel
- [ ] **T-051** Mark sub-task complete → status updates, parent task not auto-completed
- [ ] **T-052** Delete a sub-task → removed from list

### 3.6 Status Transitions
- [ ] **T-053** As Member: move task from Backlog → In Progress → In Review (allowed)
- [ ] **T-054** As Member: try to move task to "Completed" → blocked (should fail or not show option)
- [ ] **T-055** As Admin/Owner: move task to "Completed" → succeeds, `completed_at` recorded
- [ ] **T-056** As Admin/Owner: move task to "Discarded" → succeeds

### 3.7 Review Lock (In Review)
- [ ] **T-057** As Member: task in "In Review" → amber lock banner visible in detail panel
- [ ] **T-058** As Member: all edit fields disabled on "In Review" task — cannot change title, priority, etc.
- [ ] **T-059** As Admin: "In Review" task is fully editable — no lock banner

### 3.8 Task Metadata Fields
- [ ] **T-060** Fill `ai_model_used` field → saved and displayed
- [ ] **T-061** Fill `benchmark_score` field → saved and displayed
- [ ] **T-062** Fill `repo_link` field → saved and displayed

### 3.9 Task Deletion
- [ ] **T-063** As Member: no delete button visible on task card/row
- [ ] **T-064** As Admin/Owner (workspace): delete button visible on task card and table row
- [ ] **T-065** Delete a task → task removed, no orphaned sub-tasks

---

## Phase 4 — Attendance

### 4.1 Marking Attendance
- [ ] **T-066** Go to `/dashboard/attendance` → today's date is highlighted or selectable
- [ ] **T-067** Mark attendance as "Present" → record saved
- [ ] **T-068** Mark attendance as "Absent" → record saved
- [ ] **T-069** Try marking attendance twice for the same day → upsert behavior (no duplicate, record updated)

### 4.2 Attendance History
- [ ] **T-070** Past attendance records visible in calendar/table view
- [ ] **T-071** Records from other workspaces' members do NOT appear (workspace isolation via WorkspaceMember join)

### 4.3 Admin Attendance View
- [ ] **T-072** As Admin/Owner: can mark attendance for any workspace member
- [ ] **T-073** `/api/admin/attendance` (Owner only) returns logs with workspace info

---

## Phase 5 — Ledger & Scoring

### 5.1 Ledger View
- [ ] **T-074** Go to `/dashboard/ledger` → task ledger table loads
- [ ] **T-075** Completed tasks show `multiplier_earned` correctly
- [ ] **T-076** On-time tasks show multiplier 1.0, late tasks show reduced multiplier (0.6 / 0.4 / 0.0)

### 5.2 Score Calculation
- [ ] **T-077** TPS score (max 80) calculated correctly for the month
- [ ] **T-078** AS score (max 20) = (present days / 25) × 20 — verify with known attendance data
- [ ] **T-079** Total score = TPS + AS (max 100)

---

## Phase 6 — Payout Calculator

- [ ] **T-080** Go to `/dashboard/payout` → payout calculator loads
- [ ] **T-081** Enter total payout pool → 60% Treasury / 24% Base / 16% Performance splits shown
- [ ] **T-082** Performance split is proportional to each member's score
- [ ] **T-083** Member with score 0 gets no performance share

---

## Phase 7 — Settings

### 7.1 Profile Settings
- [ ] **T-084** Go to `/dashboard/settings` → Profile tab visible
- [ ] **T-085** Update `full_name` as Member → saved without email verification
- [ ] **T-086** Update `full_name` as Admin/Owner → email verification link sent
- [ ] **T-087** Click email verification link → profile updated, redirected to dashboard

### 7.2 Workspace Settings (Admin/Owner)
- [ ] **T-088** Workspace Settings tab visible to Admin/Owner, hidden or read-only for Member
- [ ] **T-089** Edit workspace name/description → saved
- [ ] **T-090** Members list shows all workspace members with their `workspace_role` badges
- [ ] **T-091** Remove a member from workspace → member no longer appears in workspace member list
- [ ] **T-092** Removed member can no longer see workspace tasks (isolation check)

### 7.3 Invitation Manager (Workspace Settings)
- [ ] **T-093** Admin/Owner: create invitation → ACTIVE code generated, copy button works
- [ ] **T-094** Member: create invitation → PENDING_APPROVAL code generated
- [ ] **T-095** Cancel an invitation → status changes to EXPIRED, code no longer usable
- [ ] **T-096** Share ACTIVE invite code → new user joins workspace instantly
- [ ] **T-097** Share PENDING_APPROVAL code → claimer recorded, join blocked until approved

### 7.4 Approval Queue
- [ ] **T-098** PENDING_APPROVAL invite used by a claimer → appears in admin approval queue
- [ ] **T-099** Admin approves → claimer joins workspace
- [ ] **T-100** Admin rejects → claimer does not join, invite marked rejected/expired

---

## Phase 8 — Notifications

- [ ] **T-101** Mention `@firstname` in a task comment → notification bell shows badge count
- [ ] **T-102** Open notification panel → mention notification visible with task title and actor name
- [ ] **T-103** Click "Mark all read" → badge count clears
- [ ] **T-104** Notification panel closes and reopens → count remains 0 after mark-all-read

---

## Phase 9 — Member Profile

- [ ] **T-105** Go to `/dashboard/member/[id]` for any workspace member → profile page loads
- [ ] **T-106** Profile shows member's score, task history, attendance summary
- [ ] **T-107** Viewing your own profile → same data shown

---

## Phase 10 — Admin Panel (Owner Only)

- [ ] **T-108** Navigate to `/admin` as Owner → panel loads
- [ ] **T-109** Navigate to `/admin` as Member/Guest → access denied (redirected or 403)
- [ ] **T-110** Users table shows all users with global role and Workspaces column (workspace badges)
- [ ] **T-111** Workspace filter dropdown → filters users by workspace membership
- [ ] **T-112** PATCH user role as Owner → role updated, reflected immediately
- [ ] **T-113** Attendance logs table → all workspace attendance logs visible with workspace info
- [ ] **T-114** Workspaces table → all workspaces listed

---

## Phase 11 — Security & Isolation

### 11.1 Role Enforcement
- [ ] **T-115** JWT role cannot be faked — log out, manually craft a session token, attempt admin action → rejected
- [ ] **T-116** `/admin` role check hits the DB directly (not JWT) → stale token cannot bypass it
- [ ] **T-117** Workspace-role elevation: Member globally but Admin in workspace → has admin rights inside that workspace only

### 11.2 Cross-Workspace Isolation
- [ ] **T-118** `GET /api/tasks?workspaceId=other-workspace-id` (where you are not a member) → returns empty array, not 403 or data leak
- [ ] **T-119** `PATCH /api/tasks` on a task from another workspace → 403 Forbidden
- [ ] **T-120** `DELETE /api/tasks` on a task from another workspace → 403 Forbidden

### 11.3 API Auth Guards
- [ ] **T-121** `GET /api/tasks` without any auth session → 401 Unauthorized
- [ ] **T-122** `POST /api/tasks` as Member (not admin) with another user as assignee → verify role constraint holds
- [ ] **T-123** `GET /api/admin/attendance` as Member → 403 Forbidden

---

## Phase 12 — Edge Cases & Stress

- [ ] **T-124** Create task with maximum-length title (255+ chars) — truncation or error shown
- [ ] **T-125** Task deadline set in the past → task created, shown as overdue in UI
- [ ] **T-126** Assign task to a user who is not a member of the workspace → error or validation
- [ ] **T-127** Mark attendance for a date 6 months in the past → upsert succeeds or blocked (define expected behavior)
- [ ] **T-128** Delete a workspace member who has open tasks → tasks remain, assignee relation preserved (`onDelete: Cascade` on User, not Member)
- [ ] **T-129** User with no workspaces logs in → sees "Join or Create" prompt, dashboard shows empty state gracefully
- [ ] **T-130** Two admins approve/reject the same pending invite simultaneously → only one action wins, no crash
- [ ] **T-131** `@mention` of a name that matches no workspace member → no notification created, no crash
- [ ] **T-132** Profile verification token used twice → second use rejected (single-use)
- [ ] **T-133** Expired password reset token → meaningful error shown

---

## Phase 13 — UI / Visual Quality

- [ ] **T-134** No broken layout on mobile viewport (375px wide)
- [ ] **T-135** No broken layout on 1280px desktop
- [ ] **T-136** Dark/light mode (if applicable) — no invisible text
- [ ] **T-137** STATUS_LABELS applied everywhere — "Todo" never appears raw in UI, shows as "Backlog"; "In Review" shows as "Review"
- [ ] **T-138** No emoji anywhere in the interface (per code convention)
- [ ] **T-139** Loading states present when data is being fetched (spinners or skeletons)
- [ ] **T-140** Error states present when an API call fails (not blank white screen)

---

## Summary Table

| Phase | Area | Total | Passed | Bugs |
|-------|------|-------|--------|------|
| 1 | Auth & Onboarding | 16 | | |
| 2 | Dashboard & Nav | 12 | | |
| 3 | Task Management | 37 | | |
| 4 | Attendance | 8 | | |
| 5 | Ledger & Scoring | 6 | | |
| 6 | Payout | 4 | | |
| 7 | Settings | 17 | | |
| 8 | Notifications | 4 | | |
| 9 | Member Profile | 3 | | |
| 10 | Admin Panel | 7 | | |
| 11 | Security & Isolation | 9 | | |
| 12 | Edge Cases | 10 | | |
| 13 | UI / Visual | 7 | | |
| **Total** | | **140** | | |

---

## Bug Log

| ID | Test | Description | Severity | Status |
|----|------|-------------|----------|--------|
| | | | | |
