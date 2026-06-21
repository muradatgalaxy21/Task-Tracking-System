# AI & Beyond Evaluator - Complete Application Documentation

This document provides a comprehensive breakdown of every feature, its working mechanism, structural flow, access control, and implementation details. It is written so that anyone reading it can fully understand what this application does and how it works.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Architecture](#2-tech-stack--architecture)
3. [Authentication System](#3-authentication-system)
4. [User Onboarding](#4-user-onboarding)
5. [Role-Based Access Control (RBAC)](#5-role-based-access-control-rbac)
6. [Workspace System](#6-workspace-system)
7. [Dashboard & Statistics](#7-dashboard--statistics)
8. [Task Management System](#8-task-management-system)
9. [Task Detail Panel (Deep Dive)](#9-task-detail-panel-deep-dive)
10. [Activity Feed & Comments](#10-activity-feed--comments)
11. [Task Ledger (Project History)](#11-task-ledger-project-history)
12. [Daily Attendance System](#12-daily-attendance-system)
13. [Scoring Engine (TPS + AS)](#13-scoring-engine-tps--as)
14. [Payout Distribution Calculator](#14-payout-distribution-calculator)
15. [Member Analytics Page](#15-member-analytics-page)
16. [Admin Dashboard](#16-admin-dashboard)
17. [Email Notification System](#17-email-notification-system)
18. [Partner Presence Widget](#18-partner-presence-widget)
19. [Sidebar Navigation](#19-sidebar-navigation)
20. [Database Schema](#20-database-schema)
21. [API Route Map](#21-api-route-map)
22. [Environment Variables](#22-environment-variables)

---

## 1. Project Overview

**Application Name:** AI & Beyond Evaluator
**Purpose:** Internal team performance evaluation and task tracking system built for the AI & Beyond agency. It tracks tasks, attendance, calculates performance scores, and distributes payouts based on individual contributions.

**Core Business Logic:**
- Assign tasks to team members with deadlines
- Track task completion against deadlines using a multiplier penalty system
- Record daily attendance (Present / Late / Absent)
- Calculate composite scores: Task Performance Score (65%) + Attendance Score (35%)
- Distribute monthly payouts proportionally based on scores (100% Performance pool)

**Four Founding Partners:** Murad, Abdullah, Mujtaba, Abdul Ahad (shown in Partner Presence widget)

---

## 2. Tech Stack & Architecture

| Layer | Technology | Location |
|---|---|---|
| Frontend | Next.js + React 19 | `src/app/` (pages), `src/components/` |
| Styling | Tailwind CSS 4 | `src/app/globals.css` |
| Auth | NextAuth.js (v4) | `src/lib/auth.ts` |
| Database | SQLite via Prisma ORM | `prisma/schema.prisma`, `dev.db` |
| API | Next.js Route Handlers | `src/app/api/` |
| Calculations | TypeScript Engine | `src/lib/calculations.ts` |
| Types | TypeScript Interfaces | `src/lib/types.ts` |
| Icons | Lucide React | Used across all components |
| Font | Inter (Google Fonts) | Loaded in `src/app/layout.tsx` |
| Email | Nodemailer (SMTP) | `src/app/api/notify-review/route.ts` |
| Password Hashing | bcryptjs | Signup and login flows |

**Structural Flow:**
```
User Request --> Next.js Route Handler (API) --> Prisma ORM --> SQLite Database
                      |
               NextAuth Session Check (JWT Strategy)
                      |
               RBAC Guard (requireRole / hasMinimumRole)
```

**Key Directories:**
- `src/app/` - Pages and API routes (Next.js App Router)
- `src/components/` - Reusable UI components
- `src/lib/` - Core logic (auth, calculations, RBAC, types)
- `prisma/` - Database schema and SQLite file
- `database/` - Legacy Supabase SQL migration files (historical reference)

---

## 3. Authentication System

**Files:** `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/lib/auth.ts`, `src/app/api/auth/signup/route.ts`

### 3.1 Supported Authentication Methods

| Method | Implementation | Status |
|---|---|---|
| Email + Numeric Passcode | `CredentialsProvider` | Active (Primary) |
| Google OAuth | `GoogleProvider` | Conditional (requires env vars) |
| GitHub OAuth | `GithubProvider` | Conditional (requires env vars) |
| Magic Link (Email) | `EmailProvider` | Configured (requires SMTP) |

### 3.2 Login Flow (Step-by-Step)

The login page (`/login`) implements a **multi-step wizard**:

**Step 1 - Email Verification:**
- User enters email address
- Frontend calls `POST /api/user/check-email` to verify if the email exists in the database
- If **login mode** and email does not exist --> error "No account found"
- If **signup mode** and email already exists --> error "Account already exists"
- If valid, user proceeds to next step

**Step 2 - Workspace Setup (Signup Only):**
- New user chooses between:
  - **Create a Workspace:** User provides a workspace name, becomes the Owner
  - **Join a Team:** User provides an invite code to join an existing workspace

**Step 3 - Credentials:**
- **Login:** User enters their numeric passcode (8-12 digits). System validates via `bcrypt.compare()`. On success, `signIn("credentials")` creates a JWT session and redirects to `/dashboard`.
- **Signup:** User creates a passcode (min 8 digits). System hashes it with `bcrypt.hash(password, 10)`, creates the User record, optionally creates/joins a workspace, auto-signs in, and redirects to `/onboarding`.

### 3.3 Session Management

- **Strategy:** JWT (stateless tokens, no server-side sessions)
- **Session Callback:** Fetches `role` fresh from DB on every session read to prevent stale permission data
- **JWT Callback:** Stores `full_name` in token on initial sign-in; syncs when client calls `update()` after onboarding
- **Custom Sign-In Page:** `/login`

### 3.4 Passcode Rules
- Numeric only (regex: `/\D/g` strips non-digits)
- Minimum 8 characters, maximum 12
- Input uses `inputMode="numeric"` for mobile keyboard optimization

---

## 4. User Onboarding

**File:** `src/app/onboarding/page.tsx`

### Flow
1. After signup, user is redirected to `/onboarding`
2. The `AuthProvider` checks if `full_name` is null -- if so, it redirects to `/onboarding` from any dashboard page
3. User fills in **Full Name** and **Date of Birth**
4. Data is saved via `PATCH /api/user/update`
5. NextAuth session is updated client-side via `update({ full_name })`
6. User is redirected to `/dashboard`

### Access Control
- Only accessible to authenticated users who have not completed their profile
- Once `full_name` is set, the onboarding redirect stops

---

## 5. Role-Based Access Control (RBAC)

**Files:** `src/lib/rbac.ts` (server), `src/lib/rbac-utils.ts` (client-safe)

### 5.1 Role Hierarchy

| Role | Rank | Description |
|---|---|---|
| **Owner** | 4 | Full system access, billing management |
| **Admin** | 3 | Task approval, attendance management, payout access |
| **Member** | 2 | Task creation, status updates on own tasks |
| **Guest** | 1 | Read-only access |

**Important:** Role checks are **hierarchical**. An Owner satisfies any Admin check. An Admin satisfies any Member check. This is implemented via:
```typescript
hasMinimumRole(userRole, requiredRole) --> ROLE_RANK[userRole] >= ROLE_RANK[requiredRole]
```

### 5.2 Permission Matrix

| Action | Guest | Member | Admin | Owner |
|---|---|---|---|---|
| View dashboard & tasks | Yes | Yes | Yes | Yes |
| Create tasks | No | Yes | Yes | Yes |
| Update own task status | No | Todo->InProgress, InProgress->InReview | All transitions | All transitions |
| Mark task as Completed | No | No | Yes | Yes |
| Delete tasks | No | No | Yes | Yes |
| View attendance page | Yes | Yes | Yes | Yes |
| Save attendance records | No | No | Yes | Yes |
| Access Payout Calculator | No | No | Yes | Yes |
| View own member analytics | No | Yes | Yes | Yes |
| View others' analytics | No | No | Yes | Yes |
| Manage user roles (Admin page) | No | No | Yes | Yes |
| Manage workspaces | No | No | Yes | Yes |

### 5.3 Server-Side Guards
- `requireRole(minimumRole)` - Returns 401 if not authenticated, 403 if role is insufficient
- `requireAuth()` - Shorthand for `requireRole("Guest")` (any authenticated user)
- Used in API route handlers before any data operation

### 5.4 Client-Side Guards
- `useAuth()` hook provides: `isOwner`, `isAdmin`, `isMember`, `isGuest` flags
- UI elements are conditionally rendered based on these flags
- Helper functions: `canManageBilling(role)`, `canManageMembers(role)`, `canCreateTasks(role)`, `isReadOnly(role)`

---

## 6. Workspace System

**Files:** `src/app/api/workspaces/route.ts`, Prisma models `Workspace`, `WorkspaceMember`

### 6.1 What is a Workspace?
A workspace is an organizational container (similar to Notion/Slack workspaces). Each workspace:
- Has a **name** and **description**
- Has an auto-generated **invite_code** (UUID) for team joining
- Contains **members** with workspace-specific roles
- Can contain **pages** (tasks, notes, attendance)
- Is associated with **tasks** via `workspace_id`

### 6.2 Creating a Workspace
- During signup: User selects "Create a Workspace", provides a name
- Via sidebar: Admin/Owner can create new workspaces
- Creator automatically gets **Owner** role in that workspace
- Invite code is generated via `randomUUID()`

### 6.3 Joining a Workspace
- During signup: User pastes an invite code
- System validates the code against `workspace.invite_code`
- User is added as a **Member** in `WorkspaceMember` table

### 6.4 Workspace Switcher
- Located in the sidebar below the logo
- Dropdown shows all workspaces the user belongs to
- Admin/Owner can create new workspaces from the dropdown

---

## 7. Dashboard & Statistics

**File:** `src/app/dashboard/page.tsx`

### 7.1 Layout
The dashboard is wrapped in `DashboardLayout` which provides:
- `AuthProvider` context for all child pages
- Fixed **Sidebar** navigation (260px wide, collapsible to 56px)
- Main content area with left margin offset

### 7.2 Stats Cards
The dashboard shows stat cards that differ based on role:

**Admin sees 4 cards:**
1. **Team Members** - Total registered users count
2. **Total Tasks** - All tasks across the system
3. **Completed** - All completed tasks
4. **Avg. Score** - Average total score across all members

**Member sees 3 cards:**
1. **My Tasks** - Tasks assigned to the logged-in user
2. **Completed** - User's completed tasks
3. **My Score** - User's personal TPS + AS score

### 7.3 Data Flow
1. Dashboard fetches `/api/members`, `/api/tasks`, `/api/attendance` in parallel
2. For each member, it calculates TPS and AS using the calculation engine
3. Computes average scores for Admin view or personal score for Member view
4. Stats auto-refresh when `refreshKey` changes (tab focus, manual refresh)

---

## 8. Task Management System

**Files:** `src/components/tasks/TaskListView.tsx`, `TaskTableRow.tsx`, `KanbanBoard.tsx`, `CreateTaskModal.tsx`

### 8.1 Task Data Model

| Field | Type | Description |
|---|---|---|
| `task_id` | UUID | Primary key |
| `title` | String | Task name (required) |
| `description` | String | Markdown-supported description |
| `assignee_id` | String | FK to User who is responsible |
| `workspace_id` | String? | Optional workspace association |
| `status` | Enum | Todo, In Progress, In Review, Completed |
| `priority` | Enum? | Urgent, High, Medium, Low |
| `estimated_days` | Int | Estimated completion time |
| `max_deadline` | DateTime | Hard deadline for multiplier calculation |
| `created_at` | DateTime | Task creation timestamp |
| `completed_at` | DateTime? | Set automatically when status = Completed |
| `multiplier_earned` | Float? | Locked-in multiplier at completion time |
| `ai_model_used` | String? | AI model used for the task |
| `benchmark_score` | String? | Performance benchmark result |
| `repo_link` | String? | GitHub/GitLab repository URL |
| `technical_requirements` | String | Technical specs (markdown) |
| `architecture_notes` | String | System design notes (markdown) |
| `estimated_hours` | Float? | Estimated hours to complete |
| `actual_hours` | Float? | Actual hours spent |
| `attachments` | String | JSON-serialized array of {name, url} |

### 8.2 Task Status Flow

```
Todo --> In Progress --> In Review --> Completed
```

**Member Transitions:** Todo -> In Progress -> In Review (forward only)
**Admin Transitions:** Any status to any other status (full control)

When a task moves to **Completed**:
1. `completed_at` is set to current timestamp
2. `multiplier_earned` is calculated and permanently stored
3. Only Admin/Owner can perform this transition

### 8.3 Dual View Modes

**List View:**
- Dense data table with columns: Task, Status, Assignee, Priority, Deadline, Progress, Multiplier
- Horizontal status tabs: All, Backlog (Todo), In Progress, Review, Completed
- Each tab shows a count badge

**Kanban View:**
- 4-column board: Todo, In Progress, In Review, Completed
- Task cards with priority badges and assignee avatars

### 8.4 Filter System
- **Search:** Free-text search on task title
- **Assigned to Me:** Toggle to show only user's tasks
- **High Priority:** Show only Urgent and High priority tasks
- **Due Today:** Show tasks with deadline = today
- **Clear All:** Reset all active filters

### 8.5 Task Creation Modal
- Fields: Title, Description, Assignee (custom dropdown), Priority, Estimated Days, Deadline
- Collapsible **Technical Details** section: AI Model Used, Benchmark Score, Repo Link
- Only visible to Admin and Member roles (`canCreateTasks`)
- On submit: `POST /api/tasks` creates the task with status "Todo"

---

## 9. Task Detail Panel (Deep Dive)

**File:** `src/components/tasks/TaskDetailPanel.tsx`

### 9.1 Structure
A **sliding drawer** panel that opens from the right side (560px wide) when clicking a task row.

### 9.2 Sections (top to bottom)

1. **Header:** Task ID (e.g., `AB-A3F2C1`), status picker, multiplier badge (if completed), task title
2. **Meta Fields:** Assignee (with avatar), Priority badge, Deadline (with overdue warning), Estimated Hours, Actual Hours
3. **Description:** Editable markdown block
4. **Technical Requirements:** Editable markdown block
5. **Architecture Notes:** Editable markdown block
6. **AI Metadata:** Chips showing AI model, benchmark score, repo link
7. **Sub-tasks:** Checklist with completion count (e.g., 2/5)
8. **Attachments & Links:** Named links with add/remove capability
9. **Status Transition Buttons:** Quick-action buttons for allowed transitions
10. **Activity Feed:** Full comment thread and audit log

### 9.3 Edit Permissions
- **Admin:** Can edit all fields on all tasks
- **Assignee:** Can edit fields on their own tasks
- **Others:** Read-only view

### 9.4 Markdown Support
The panel includes a minimal inline markdown renderer supporting:
- `**bold**`, `*italic*`, `` `code` ``
- `# Heading`, `## Subheading`
- `- Bullet points`

---

## 10. Activity Feed & Comments

**File:** `src/components/tasks/ActivityFeed.tsx`, `src/app/api/tasks/[id]/activity/`

### 10.1 Two Types of Activity

**System Audit Logs (auto-generated):**
- Created when status changes (e.g., "Murad moved this task from Backlog to In Progress")
- Stores old and new status in metadata JSON
- Displayed as small dot + text entries

**User Comments (manual):**
- Threaded comments with author avatar, name, and timestamp
- Support `@mention` syntax with autocomplete dropdown
- `@Word` patterns are highlighted in warm-400 color

### 10.2 @Mention System
- Typing `@` triggers a dropdown showing team members
- Filters by first name as user types
- Inserting a mention replaces the `@query` with `@FirstName`
- Submit via **Ctrl+Enter** or click the Send button

### 10.3 Relative Timestamps
Comments show relative time: "just now", "5m ago", "2h ago", "3d ago"

---

## 11. Task Ledger (Project History)

**File:** `src/app/dashboard/ledger/page.tsx`

### Purpose
A historical read-only table of ALL tasks (past and present) with their multiplier outcomes.

### Features
- **Search:** Filter by task title or description
- **Status Filter:** Dropdown to filter by Todo/In Progress/In Review/Completed
- **Member Filter:** Dropdown to filter by assignee
- **Columns:** Task (title + description), Assignee, Est. Days, Status, Deadline, Multiplier, Earned
- **Visual Indicators:** Overdue tasks have red background tint and warning icon
- **Multiplier Colors:** Green (1.0x), Amber (0.6x), Orange (0.4x), Red (0.0x)

---

## 12. Daily Attendance System

**File:** `src/app/dashboard/attendance/page.tsx`, `src/app/api/attendance/route.ts`

### 12.1 How It Works
1. Admin selects a **date** using the date picker
2. System loads existing attendance records for that date
3. For each team member, Admin marks: **Present** (green), **Late** (amber), or **Absent** (red)
4. On save, records are **batch upserted** (created or updated) in a single database transaction

### 12.2 Access Control
- **Viewing:** All authenticated users can see the attendance page
- **Editing/Saving:** Only Admin and Owner can save attendance records
- The Save button is hidden for non-admin users

### 12.3 Database Design
- Table: `DailyAttendance`
- Unique constraint: `[user_id, date]` (one record per user per day)
- Upsert logic: If a record exists for that user+date, update the status; otherwise create

### 12.4 Working Days
- Fixed at **25 days/month** (24 for February)
- Used in Attendance Score calculation denominator

---

## 13. Scoring Engine (TPS + AS)

**File:** `src/lib/calculations.ts`

### 13.1 Overall Formula
```
Total Score = Task Performance Score (TPS) + Attendance Score (AS)
Max Score = 65 + 35 = 100
```

### 13.2 Penalty Multiplier System

When a task is completed, the system compares `completed_at` against `max_deadline`:

| Days Late | Multiplier | Credit Earned |
|---|---|---|
| 0 (On Time) | 1.0 | Full credit |
| 1 Day Late | 0.60 | 60% credit |
| 2 Days Late | 0.40 | 40% credit |
| 3+ Days Late | 0.0 | Zero credit |

The multiplier is **permanently stored** in `multiplier_earned` at the moment of completion.

### 13.3 Task Performance Score (TPS) - Max 65

**Method: Flat average of multipliers**

1. Filter to completed/Not Done tasks in the target calendar month
2. `TPS = Flat Avg Multiplier * 65`

### 13.4 Attendance Score (AS) - Max 35

```
AS = (Present Days in Month / Total Scheduled Days) * 35
```

- "Present" counts as 1.0 day; "Late" counts as 0.5 day
- Total Scheduled Days = active days in the month (where at least one member was Present/Late)

---

## 14. Payout Distribution Calculator

**File:** `src/app/dashboard/payout/page.tsx`

### 14.1 Access Control
- **Admin/Owner only** - Members see "Access Denied" screen

### 14.2 Two-Tier Distribution Model

| Tier | Percentage | Purpose |
|---|---|---|
| Treasury | 60% of Revenue | Retained by the organization |
| Performance Pool | 40% of Revenue (100% of remaining pool) | Distributed proportionally by score |

### 14.3 How It Works

1. Admin enters **Total Monthly Revenue** (in PKR)
2. Clicks **Calculate Payouts**
3. System computes TPS and AS for every member
4. **Performance Payout** = (Member Score / Total Team Score) * Performance Pool
5. **Final Payout** = Performance Payout

### 14.4 UI Display
- **Pool Breakdown Cards:** Total Revenue, Treasury (60%), Performance Pool (40%)
- **Member Table:** Columns for TPS (/65), AS (/35), Total (/100), Share %, Payout (PKR)

---

## 15. Member Analytics Page

**File:** `src/app/dashboard/member/[id]/page.tsx`

### 15.1 Access Control
- All members can view stats/profile pages for any team member in their workspace.

### 15.2 Content Sections

1. **Member Header:** Avatar, full name, email, role badge, assessment period (current month)
2. **Score Widgets (3 circular gauges):**
   - Task Performance: X / 65 (blue)
   - Attendance: X / 35 (green)
   - Total Score: X / 100 (red)
3. **Attendance Summary:** Present/Late/Absent counts with total scheduled days
4. **Task Stats Strip:** Total Tasks, Completed, Active (In Progress + In Review), Overdue
5. **Weekly Performance Breakdown:** 4 cards (W1-W4) showing % efficiency and task count
6. **Task Score Breakdown Table:** Every task with its week, status, multiplier earned, and deadline

---

## 16. Admin Dashboard

**File:** `src/app/admin/page.tsx`, `src/app/api/admin/users/`, `src/app/api/admin/workspaces/`

### 16.1 Features
- **Stats Row:** Total Users, Workspaces, Owners count
- **Users Table:** Email, Name, Role (editable dropdown: Owner/Admin/Member/Guest)
- **Workspaces Table:** Name, Member Count, Invite Code (with copy-to-clipboard button)

### 16.2 Role Management
- Admin can change any user's role via the dropdown
- Changes are saved immediately via `PATCH /api/admin/users/[userId]`
- Visual feedback: Loading spinner during save, green checkmark on success

---

## 17. Email Notification System

**File:** `src/app/api/notify-review/route.ts`

### Trigger
When a task status changes to **"In Review"**, an email notification is sent to the admin.

### Email Content
- Premium dark-themed HTML template
- Contains: Status badge ("In Review"), task title, submitter name, estimated days
- Call-to-action button linking to the dashboard
- Sent via Nodemailer using SMTP credentials from environment variables

### Configuration
Requires: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `NOTIFY_EMAIL`

---

## 18. Partner Presence Widget

**File:** `src/components/dashboard/TeamPresence.tsx`

### Purpose
Shows all Owner/Admin partners on the dashboard with their active task count.

### Implementation
- Fetches all members and tasks from API
- Filters to only Owner and Admin role users
- Counts non-completed tasks per partner
- Displays as a 4-column grid of cards with avatar, name, role, and task badge
- Each partner gets a unique avatar color (warm, blue, violet, emerald)

---

## 19. Sidebar Navigation

**File:** `src/components/layout/Sidebar.tsx`

### Structure (top to bottom)
1. **Logo:** "AB" badge + "AI & Beyond" + "Agency Dashboard"
2. **Workspace Switcher:** Dropdown to switch between workspaces
3. **Navigation Links:**
   - Dashboard (`/dashboard`)
   - Tasks (`/dashboard/tasks`)
   - Projects (`/dashboard/ledger`)
   - Team (`/dashboard/attendance`)
   - My Profile (`/dashboard/member/[id]`) - Quick link to current user's profile
   - Reports (`/dashboard/payout`) - Admin only
   - Month End (`/dashboard/month-end`) - Owner only
   - My History (`/dashboard/history`) - Finalized payouts history
   - Settings (`/dashboard/settings`)
4. **Members List:** Clickable list of all team members linking to their analytics pages (visible to all users)
5. **User Footer:** Avatar initials, full name, email, role, Sign Out button, Privacy Policy link (footer)
6. **Collapse Toggle:** Button on the right edge to collapse sidebar to icon-only mode (56px)

### Collapsible Behavior
- Full width: 260px with labels
- Collapsed: 56px with icons only
- Toggle button is a circular button positioned on the sidebar edge

---

## 20. Database Schema

### Core Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `User` | User accounts | id, email, password (hashed), full_name, dob, role, image |
| `Account` | OAuth provider accounts | userId, provider, providerAccountId, access_token |
| `Session` | NextAuth sessions | sessionToken, userId, expires |
| `VerificationToken` | Email verification | identifier, token, expires |
| `Workspace` | Team containers | id, name, description, invite_code (unique), created_by |
| `WorkspaceMember` | User-workspace mapping | workspace_id + user_id (composite PK), role |
| `Page` | Content pages in workspaces | workspace_id, title, page_type (tasks/notes/attendance) |
| `TaskLedger` | All tasks | task_id, title, assignee_id, status, priority, max_deadline, multiplier_earned |
| `TaskActivity` | Audit log & comments | task_id, user_id, type (comment/status_change/field_update), content |
| `SubTask` | Checklist items under tasks | parent_task_id, title, status (Todo/Completed) |
| `DailyAttendance` | One record per user per date | user_id + date (unique), status (Present/Late/Absent) |

### Key Relationships
```
User --< TaskLedger (assignee)
User --< DailyAttendance
User --< WorkspaceMember >-- Workspace
Workspace --< Page
Workspace --< TaskLedger
TaskLedger --< SubTask
TaskLedger --< TaskActivity
```

---

## 21. API Route Map

| Method | Endpoint | Purpose | Auth Required | Min Role |
|---|---|---|---|---|
| POST | `/api/auth/signup` | Create new account | No | - |
| POST | `/api/user/check-email` | Verify if email exists | No | - |
| PATCH | `/api/user/update` | Update profile (name, dob) | Yes | Guest |
| GET | `/api/members` | List all users or get by ID | Yes | Guest |
| GET | `/api/tasks` | List tasks (filterable) | Yes | Guest |
| POST | `/api/tasks` | Create a new task | Yes | Member |
| PATCH | `/api/tasks` | Update task fields/status | Yes | Member (own) / Admin (all) |
| DELETE | `/api/tasks?id=X` | Delete a task | Yes | Admin |
| GET | `/api/tasks/[id]/activity` | Get task activity feed | Yes | Guest |
| POST | `/api/tasks/[id]/activity` | Post a comment | Yes | Member |
| GET | `/api/attendance` | Get attendance records | Yes | Guest |
| POST | `/api/attendance` | Log/update attendance | Yes | Admin |
| GET | `/api/workspaces` | Get user's workspaces | Yes | Guest |
| POST | `/api/workspaces` | Create a workspace | Yes | Guest |
| POST | `/api/workspaces/join` | Join via invite code | Yes | Guest |
| GET | `/api/admin/users` | List all users (admin) | Yes | Admin |
| PATCH | `/api/admin/users/[id]` | Update user role | Yes | Admin |
| GET | `/api/admin/workspaces` | List all workspaces (admin) | Yes | Admin |
| POST | `/api/notify-review` | Send review email | Yes | Member |

---

## 22. Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | SQLite database path (`file:./dev.db`) | Yes |
| `NEXTAUTH_SECRET` | JWT signing secret | Yes |
| `NEXTAUTH_URL` | Application base URL | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (legacy) | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (legacy) | No |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No (enables Google login) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | No |
| `GITHUB_ID` | GitHub OAuth app ID | No (enables GitHub login) |
| `GITHUB_SECRET` | GitHub OAuth secret | No |
| `SMTP_HOST` | Email server host | No (enables email features) |
| `SMTP_PORT` | Email server port | No |
| `SMTP_USER` | Email username/from address | No |
| `SMTP_PASS` | Email password | No |
| `NOTIFY_EMAIL` | Admin email for notifications | No |
| `NEXT_PUBLIC_APP_URL` | Public app URL for email links | No |

A template is provided in `.env.example`.
