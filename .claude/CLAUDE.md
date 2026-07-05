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
- `BLOB_READ_WRITE_TOKEN` — required for Vercel Blob file uploads
- SMTP variables are required for magic-link login and email notifications; Google/GitHub OAuth are optional (omit to disable those buttons)

## Architecture

### Stack

Next.js 16 App Router · React 19 · Prisma 6 (SQLite/libsql) · NextAuth v4 · Tailwind CSS v4 · TypeScript

### Route Layout

```
src/app/
  page.tsx                  # redirects / to /dashboard or /login
  dashboard/                # authenticated shell (AuthProvider + WorkspaceProvider + Sidebar)
    page.tsx                # stats overview + pending reviews prompt for admins
    attendance/             # daily attendance sheet
    chat/                   # workspace chat (TEMPORARILY DISABLED — returns 503; pending serverless migration)
    history/                # user payout/score history
    ledger/                 # task ledger view
    month-end/              # monthly close panel
    payout/                 # payout calculator
    policy/                 # privacy policy acceptance gate (redirects to dashboard once accepted)
    member/[id]/            # individual member profile
    settings/               # user settings
    tasks/                  # task board view
  admin/                    # Owner-only panel (server-side role check in layout.tsx)
    page.tsx                # users + workspaces + attendance logs tables
  api/
    attendance/             # GET (any auth) / POST (Admin+)
    admin/attendance/       # GET (Owner only) — all logs with workspace info
    admin/logs/             # GET (Owner only) — audit log viewer
    admin/pending-reviews/  # GET (Admin+) — pending "In Review" task counts per workspace
    admin/users/            # GET / PATCH (Owner only)
    admin/workspaces/       # GET (Owner only)
    chat/                   # GET / POST — DISABLED, returns 503
    cron/deadline-alerts/   # GET — cron job for deadline notification emails
    invitations/            # invite code CRUD
    members/                # user lookup + workspace-scoped member list
    monthly-close/          # month-end close CRUD
    notifications/          # in-app notifications
    settings/accept-policy/ # POST — records user's privacy policy acceptance
    settings/profile/       # profile update with email-link verification
    settings/delete-account/# request + status endpoints for account deletion flow
    tasks/                  # task CRUD
    tasks/[id]/activity/    # GET — task activity log
    upload/                 # POST — issues Vercel Blob client token (file never passes through server)
    user/update/            # PATCH — update user profile fields
    user/check-email/       # GET — check email availability
    user/payout-balance/    # GET — user's payout balance
    user/history/           # GET — user score + payout history
    workspaces/             # workspace CRUD + join
  uploads/[filename]/       # GET — serves legacy local files (new uploads use Vercel Blob URLs directly)
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

Two components combine into a 100-point score (v3 engine):

- **TPS (max 65)** — Task Performance Score. Flat average of all multipliers for `Completed` or `Not Done` tasks in the calendar month × 65. Weekly breakdown is computed for display only — it does not affect the score. Multipliers: on-time = 1.0, ≤24h late = 0.60, ≤48h late = 0.40, >48h late = 0.0. `Not Done` tasks always earn multiplier 0. The multiplier is stored on `TaskLedger.multiplier_earned` at completion time and takes precedence over dynamic recalculation. `review_submitted_at` is used as the reference point (not `completed_at`) so members aren't penalised for admin review delay.
- **AS (max 35)** — Attendance Score. `(Present days / active days in month) × 35`. Active days = unique calendar days in the month where at least one workspace member was Present or Late (computed by `getActiveDaysInMonth`). `Present` = 1.0 day; `Late` = 0.5 days (fractional). Scores are returned with two decimal precision.

**Date parsing rule:** Never use `new Date(dateString)` to compare attendance dates — Turso returns ISO strings (e.g. `"2024-05-28T19:00:00.000Z"`) and `new Date()` will shift the date in non-UTC timezones. Always slice the ISO prefix directly: `s.slice(0, 10)` → `"2024-05-28"`, then split on `"-"` to extract year/month/day. This pattern is used throughout `calculations.ts` and attendance UI components.

Payouts use a 2-tier split: 60% Treasury / 40% Performance (score-proportional). Distribution pool = 40% of revenue; Performance = 100% of pool.

### Task Status Convention

DB values are `"Todo" | "In Progress" | "In Review" | "Completed" | "Not Done" | "Discarded"`. Display labels differ — always use `STATUS_LABELS` from `src/lib/types.ts` when rendering status strings in the UI (e.g. `"Todo"` displays as `"Backlog"`).
Members cannot transition to `Completed`. Admin/Owner transitions are unrestricted. `Not Done` is a terminal status (like `Completed`) that counts in TPS with multiplier 0 — it represents work that was abandoned after the deadline.

### Database

SQLite via Prisma with the libsql adapter. The composite unique key `@@unique([user_id, date])` on `DailyAttendance` enforces one record per user per day; upsert on `user_id_date` is the intended write pattern. `DailyAttendance` has no `workspace_id` — workspace filtering is done by joining through `WorkspaceMember`.

### Invitation Flow

Two tiers: Admin/Owner-generated invites are `ACTIVE` (instant join). Member-generated invites start `PENDING_APPROVAL` — a claimer is recorded when someone uses the code, and an Admin must approve before the user joins the workspace.

Invite codes are looked up in the `Invitation` table first (new codes, stored uppercase), then fall back to the legacy `Workspace.invite_code` field (static UUID from onboarding). This lookup order applies in both `/api/auth/signup` and `/api/workspaces/join` — always keep them in sync.

### File Uploads (Vercel Blob)

File uploads use the Vercel Blob client-upload pattern — the file bytes go directly from the browser to Blob storage; the server never receives the body. `POST /api/upload` issues a short-lived, category-constrained client token via `@vercel/blob/client`'s `handleUpload`. The route also receives the completion callback from Vercel to acknowledge the upload.

Two categories are defined in `src/lib/upload.ts`:
- `"avatar"` — images only, max 5 MB. Client compresses to 400×400 JPEG at 0.8 quality before upload (`optimizeImage` in `ProfileSettingsPanel.tsx`).
- `"chat"` — images + common document formats (PDF, Word, Excel, PowerPoint, text, CSV, ZIP), max 25 MB.

The client passes the category in `clientPayload` when requesting the token. The server re-enforces the allowlist and size cap through the token itself — the client-side `validateFileForUpload` helper in `src/lib/upload.ts` is a UX convenience only. Requires `BLOB_READ_WRITE_TOKEN` in the environment.

The legacy `uploads/[filename]/` route still serves any files written to the local `uploads/` directory before the Blob migration.

### Chat

Chat is **temporarily disabled** while the feature is being migrated to the serverless architecture. Both `GET` and `POST /api/chat` return `503 Service Unavailable`. Do not implement chat features against the current route.

### Privacy Policy & Cookie Consent

Users must accept the privacy policy before accessing the dashboard. The `accepted_privacy_policy` boolean field on `User` tracks acceptance. On login, `AuthProvider` redirects unauthenticated users to `/dashboard/policy` if the flag is false. `POST /api/settings/accept-policy` sets the flag. A cookie consent banner is shown to first-time visitors and is independent of the auth policy gate.

### Caching Layer (`src/lib/cache.ts`)

Server-side read cache backed by Next.js `unstable_cache` (persists across serverless invocations on Vercel via the Data Cache; in-memory in dev). `use cache` directive is not used — it requires `cacheComponents: true`, which conflicts with `force-dynamic` Route Handlers.

- `getCachedWorkspaceTasks(workspaceId, status?)` — 30s TTL, tagged `tasks:<workspaceId>`. Call `revalidateTag` on any task write.
- `getCachedWorkspaceMembers(workspaceId)` — 60s TTL, tagged `members`. Call `revalidateTag` on any member write.

**Rule:** cache accessors must never read request APIs (cookies/headers). Run auth + membership checks first, then pass plain IDs into the cache functions.

### Shared Components

- `src/components/common/UserAvatar.tsx` — renders a user avatar from `image_url` or falls back to initials; accepts `size` and `className` props.
- `src/components/layout/NotificationsBell.tsx` — polls `/api/notifications` and shows an unread badge; marks all read on dropdown open.

## Code Conventions

- No emojis anywhere in code or comment strings.
- Comments belong immediately next to the relevant line, not grouped at the bottom of a function.
- Import server-only utilities (`requireRole`, Prisma) only in API routes or Server Components — never in `"use client"` files. Use `src/lib/rbac-utils.ts` for client components.
- `export const dynamic = "force-dynamic"` is required on every API route that reads session data.
- AI agents will never add themselves as collaborators in GitHub.

