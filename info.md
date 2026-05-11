# AI & Beyond Evaluator - Self-Maintenance Guide

This document is a comprehensive reference for maintaining and customizing the AI & Beyond Evaluator application. It explains the key systems, how to modify them, and where to find the relevant code.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Scoring System (80/20 Split)](#scoring-system)
3. [Multiplier Tiers](#multiplier-tiers)
4. [Payout Distribution](#payout-distribution)
5. [Database Schema](#database-schema)
6. [Adding New Task Statuses](#adding-new-task-statuses)
7. [Theme Colors](#theme-colors)
8. [Workspace System](#workspace-system)
9. [Environment Variables](#environment-variables)

---

## Architecture Overview

| Layer       | Technology    | Location                          |
|-------------|--------------|-----------------------------------|
| Frontend    | Next.js + React 19 | `src/app/` (pages), `src/components/` (components) |
| Styling     | Tailwind CSS 4 | `src/app/globals.css`            |
| Auth        | Supabase Auth | `src/components/providers/AuthProvider.tsx` |
| Database    | Supabase (PostgreSQL) | `database/` (migration SQL files) |
| API         | Next.js Route Handlers | `src/app/api/`             |
| Calculations | TypeScript   | `src/lib/calculations.ts`        |
| Types       | TypeScript   | `src/lib/types.ts`               |

---

## Scoring System

The scoring system uses an **80/20 split**:
- **Task Performance Score (TPS)**: 80 points max
- **Attendance Score (AS)**: 20 points max
- **Total Score**: TPS + AS = 100 points max

### How to Change the Split

Open `src/lib/calculations.ts`:

**TPS Weight (currently 80):**
Find line ~211:
```typescript
const score = Math.round(meanAvg * 80 * 100) / 100;
```
Change `80` to your desired TPS weight (e.g., `70` for a 70/30 split).

**AS Weight (currently 20):**
Find line ~258:
```typescript
const score = (presentDays / totalScheduled) * 20;
```
Change `20` to your desired AS weight (e.g., `30` for a 70/30 split).

> **Important:** Both weights should always add up to 100.

---

## Multiplier Tiers

The multiplier determines how much credit a member gets for completing a task relative to the deadline.

Current tiers (in `src/lib/calculations.ts`, function `getMultiplier`):

| Days Late | Multiplier | Label           |
|-----------|-----------|-----------------|
| 0         | 1.0       | On Time         |
| 1         | 0.60      | 1 Day Late      |
| 2         | 0.40      | 2 Days Late     |
| 3+        | 0.0       | N Days Late     |

### How to Modify

Find the `getMultiplier` function (~line 24) in `src/lib/calculations.ts` and adjust the `if/else` chain:

```typescript
if (daysLate === 0) {
  return { multiplier: 1.0, daysLate, label: "On Time" };
} else if (daysLate === 1) {
  return { multiplier: 0.60, daysLate, label: "1 Day Late" };
} else if (daysLate === 2) {
  return { multiplier: 0.40, daysLate, label: "2 Days Late" };
} else {
  return { multiplier: 0.0, daysLate, label: `${daysLate} Days Late` };
}
```

---

## Payout Distribution

3-tier system (function `calculatePayouts` in `src/lib/calculations.ts`):

| Tier | Allocation | Purpose |
|------|-----------|---------|
| Treasury | 60% of Revenue | Retained by organization |
| Base Pool | 24% of Revenue (60% of remaining 40%) | Split equally among members |
| Performance Pool | 16% of Revenue (40% of remaining 40%) | Distributed by score ratio |

### How to Change Ratios

In `calculatePayouts` (~line 290):
```typescript
const distributionPool = totalRevenue * 0.40;  // Change 0.40 to adjust treasury/distribution split
const basePool = distributionPool * 0.60;       // Change 0.60 to adjust base/performance split
const performancePool = distributionPool * 0.40; // This should equal 1.0 - basePool ratio
```

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User accounts (id, email, full_name, role) |
| `tasks_ledger` | All tasks with status, deadline, multiplier |
| `sub_tasks` | Sub-items within tasks |
| `daily_attendance` | One record per user per date |
| `workspaces` | Project/team containers |
| `workspace_members` | User-workspace mapping |
| `pages` | Content pages within workspaces |

### Migration Files

Located in `database/`:
- `001_schema.sql` - Initial tables
- `002_rls_policies.sql` - Row-level security
- `003_updates.sql` - Multiplier and attendance updates
- `004_workspaces.sql` - Workspace, pages, and priority

---

## Adding New Task Statuses

1. **Update the type** in `src/lib/types.ts`:
   ```typescript
   export type TaskStatus = "Todo" | "In Progress" | "In Review" | "Completed" | "YourNewStatus";
   ```

2. **Add a CSS class** in `src/app/globals.css`:
   ```css
   .status-your-new-status {
     background: rgba(R, G, B, 0.12);
     color: #hexcolor;
   }
   ```

3. **Add a tab** in `src/components/tasks/TaskListView.tsx` (TABS array):
   ```typescript
   { id: "YourNewStatus", label: "Your Label", color: "#hexcolor" },
   ```

4. **Add status transitions** in `src/components/tasks/TaskTableRow.tsx` (function `getAllowedTransitions`).

---

## Theme Colors

The application uses a warm light theme. Colors are defined in `src/app/globals.css` under `@theme`:

| Variable | Color | Usage |
|----------|-------|-------|
| `--color-warm-50` | `#fffdf2` | Background tint |
| `--color-warm-200` | `#fceeb5` | Highlight, badges |
| `--color-warm-300` | `#fcb1b1` | Pink accents |
| `--color-warm-400` | `#e06b6b` | Primary salmon accent |
| `--color-warm-500` | `#c85555` | Hover/active state |

To change the theme, modify these values in `globals.css` and update `body` background color.

---

## Workspace System

Workspaces are organizational containers (like Notion workspaces). Each workspace:
- Has a name and description
- Contains members with roles (Admin/Member)
- Contains pages (tasks, notes, attendance)

The sidebar automatically loads workspaces from the `workspaces` table. To use this feature:
1. Run `database/004_workspaces.sql` in your Supabase SQL Editor
2. Create a workspace via the Supabase dashboard or the sidebar UI

---

## Environment Variables

Required environment variables (defined in `.env.local`):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key for client-side auth |
| `ADMIN_EMAIL` | Email address for admin notifications |
| `SMTP_HOST` | SMTP server for email notifications |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |

A template is provided in `.env.example`.
