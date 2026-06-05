# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

---

## Commands

```bash
npm run dev          # start dev server on :3000
npm run build        # production build
npm run lint         # ESLint
npm run admin:seed   # create/reset system Owner account (see scripts/create-admin.js)

npx prisma migrate dev --name <name>   # apply a new schema migration
npx prisma db push                     # push schema without creating a migration file
npx prisma studio                      # open the DB browser
```

There are no automated tests. `tsc --noEmit` is the closest equivalent for catching errors before running.

## Environment

Copy `.env.example` to `.env.local`. Minimum required variables:

- `DATABASE_URL` — SQLite file path, e.g. `file:./dev.db`
- `NEXTAUTH_SECRET` — any random string
- `NEXTAUTH_URL` — `http://localhost:3000` for local dev
- SMTP variables are required for magic-link login and email notifications; Google/GitHub OAuth are optional (omit to disable those buttons)

## Architecture

### Stack

Next.js 16 App Router · React 19 · Prisma 6 (SQLite/libsql) · NextAuth v4 · Tailwind CSS v4 · TypeScript

### Route Layout

```
src/app/
  page.tsx                  # redirects / to /dashboard or /login
  dashboard/                # authenticated shell (AuthProvider + WorkspaceProvider + Sidebar)
    page.tsx                # stats overview
    attendance/             # daily attendance sheet
    chat/                   # workspace chat with file attachments
    ledger/                 # task ledger view
    payout/                 # payout calculator
    member/[id]/            # individual member profile
    settings/               # user settings
  admin/                    # Owner-only panel (server-side role check in layout.tsx)
    page.tsx                # users + workspaces + attendance logs tables
  api/
    attendance/             # GET (any auth) / POST (Admin+)
    admin/attendance/       # GET (Owner only) — all logs with workspace info
    admin/logs/             # GET (Owner only) — audit log viewer
    admin/users/            # GET / PATCH (Owner only)
    admin/workspaces/       # GET (Owner only)
    chat/                   # GET / POST — workspace-scoped chat messages
    invitations/            # invite code CRUD
    members/                # user lookup + workspace-scoped member list
    tasks/                  # task CRUD
    upload/                 # POST — file upload, stores to uploads/ at project root
    workspaces/             # workspace CRUD + join
    notifications/          # in-app notifications
    settings/profile/       # profile update with email-link verification
  uploads/[filename]/       # GET — serves files from project-root uploads/ with MIME detection
```

### Auth & Role System

NextAuth v4 with JWT sessions. The `session` callback re-fetches `role` from the DB on every request, so JWT tokens never carry stale permissions.

**Global roles** (stored on `User.role`):  
`Guest < Member < Manager < Admin < Owner`

**Workspace roles** (stored on `WorkspaceMember.role`):  
Same five values; a user's *effective* role inside a workspace is `max(global, workspace_role)` — resolved by `resolveEffectiveRole()` in `src/lib/rbac-utils.ts`.

Server-side guards live in `src/lib/rbac.ts` (`requireRole`, `requireAuth`). These are the only functions to use in API routes — never re-implement session checks inline. Client-side role flags (`isOwner`, `isAdmin`, `isManager`, `isMember`) come from `useAuth()`.

The `/admin` layout performs a direct DB role check on every render (not JWT) to prevent bypass via stale tokens.

### Provider Hierarchy

`AuthProvider` → `WorkspaceProvider` (must nest in this order; WorkspaceProvider reads `user` from AuthProvider). Both are set up in `src/app/dashboard/layout.tsx`. Pages outside `/dashboard` (login, signup, admin) do not have either provider.

- `useAuth()` — current user, global role flags, `refreshKey` (bump to force data refetch)
- `useWorkspace()` — `activeWorkspace`, `workspaces` list, `isWorkspaceAdmin`, `isWorkspaceManager`

### Workspace Isolation

All data that is workspace-scoped must pass `workspaceId` explicitly. The `GET /api/members` route illustrates the pattern: called without params it returns all users (admin fallback only); called with `?workspaceId=X` it returns only members of that workspace. Follow the same pattern for any new workspace-scoped endpoint.

### Scoring Engine (`src/lib/calculations.ts`)

Two components combine into a 100-point score:

- **TPS (max 80)** — Task Performance Score. Completed tasks per calendar month are grouped into 4 weekly buckets (Mon–Sun). Weekly average multiplier is computed; TPS = mean of 4 week averages × 80. Multipliers: on-time = 1.0, 1 day late = 0.60, 2 days late = 0.40, 3+ days late = 0.0. The multiplier is stored on `TaskLedger.multiplier_earned` at completion time and takes precedence over dynamic recalculation.
- **AS (max 20)** — Attendance Score. `(Present days / scheduled days) × 20`. Scheduled days are fixed: 25 for most months, 24 for February.

**Date parsing rule:** Never use `new Date(dateString)` to compare attendance dates — Turso returns ISO strings (e.g. `"2024-05-28T19:00:00.000Z"`) and `new Date()` will shift the date in non-UTC timezones. Always slice the ISO prefix directly: `s.slice(0, 10)` → `"2024-05-28"`, then split on `"-"` to extract year/month/day. This pattern is used throughout `calculations.ts` and attendance UI components.

Payouts use a 3-tier split: 60% Treasury / 24% Base (equal) / 16% Performance (score-proportional).

### Task Status Convention

DB values are `"Todo" | "In Progress" | "In Review" | "Completed" | "Discarded"`. Display labels differ — always use `STATUS_LABELS` from `src/lib/types.ts` when rendering status strings in the UI (e.g. `"Todo"` displays as `"Backlog"`).
Members cannot transition to `Completed`. Admin/Owner transitions are unrestricted.

### Database

SQLite via Prisma with the libsql adapter. The composite unique key `@@unique([user_id, date])` on `DailyAttendance` enforces one record per user per day; upsert on `user_id_date` is the intended write pattern. `DailyAttendance` has no `workspace_id` — workspace filtering is done by joining through `WorkspaceMember`.

### Invitation Flow

Two tiers: Admin/Owner-generated invites are `ACTIVE` (instant join). Member-generated invites start `PENDING_APPROVAL` — a claimer is recorded when someone uses the code, and an Admin must approve before the user joins the workspace.

Invite codes are looked up in the `Invitation` table first (new codes, stored uppercase), then fall back to the legacy `Workspace.invite_code` field (static UUID from onboarding). This lookup order applies in both `/api/auth/signup` and `/api/workspaces/join` — always keep them in sync.

### Chat

`GET /api/chat?workspaceId=X` — paginated messages, optional `?since=<ISO>` for polling.  
`POST /api/chat` — send a message; `attachments` is a JSON array of `{ name, url, type }` objects uploaded via `/api/upload` beforehand.  
File uploads land in `uploads/` at the project root (not inside `public/`) and are served via the dynamic route `src/app/uploads/[filename]/route.ts`. The `Upload` route accepts `multipart/form-data` with a single `file` field and returns `{ url, name, type, size }`. Avatar images are resized and compressed to 400×400 JPEG at 0.8 quality client-side before upload via canvas (see `optimizeImage` in `ProfileSettingsPanel.tsx`).

### Shared Components

- `src/components/common/UserAvatar.tsx` — renders a user avatar from `image_url` or falls back to initials; accepts `size` and `className` props.
- `src/components/layout/NotificationsBell.tsx` — polls `/api/notifications` and shows an unread badge; marks all read on dropdown open.

## Code Conventions

- **Comments:** Provide explanatory comments at every functional step involving data manipulation (1-5 clear points) directly next to the relevant line, not grouped at the bottom.
- **Formatting:** No emojis anywhere in code or comment strings. Keep tone professional.
- **Server/Client Separation:** Import server-only utilities (`requireRole`, Prisma) only in API routes or Server Components — never in `"use client"` files. Use `src/lib/rbac-utils.ts` for client components.
- **Data Fetching:** `export const dynamic = "force-dynamic"` is required on every API route that reads session data.
- **UI/Aesthetics:** The UI should be premium. Avoid generic placeholders and plain colors. Use tailored HSL palettes, glassmorphism, and subtle micro-animations.
- **Error Handling:** Wrap data operations and external calls in `try-catch` blocks with descriptive error messages.
- **Virtual Environments:** Always use a virtual environment named `project-name-venv` if running Python scripts, and use `pathlib` for all file system operations.
