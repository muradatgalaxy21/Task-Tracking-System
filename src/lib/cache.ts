// Cached read accessors backed by Next.js' Data Cache (unstable_cache) — server-only.
//
// On Vercel the Data Cache persists across serverless invocations, so repeated
// dashboard / partner-presence loads of the same workspace reuse one DB result
// instead of hitting Turso every time; in dev it is an in-memory cache.
//
// unstable_cache is deprecated in favour of the `use cache` directive, but that
// requires opting the whole app into Cache Components (cacheComponents: true),
// which does not fit this app's force-dynamic Route Handler data layer. For data
// fetched through Route Handlers, unstable_cache remains the supported primitive
// (see node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md).
//
// Cache scopes must never read request APIs (cookies/headers): callers run auth
// and membership checks first, then pass plain ids into these accessors.

import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";

// Tag namespaces for on-demand invalidation via revalidateTag.
const TAG_MEMBERS = "members";
// Per-workspace task lists so a task change only busts its own workspace.
const workspaceTasksTag = (workspaceId: string) => `tasks:${workspaceId}`;

// Short TTLs act as a safety net: any member write whose explicit invalidation is
// missed (e.g. the admin name-change email-verification path) self-heals within a minute.
const TASKS_TTL_SECONDS = 30;
const MEMBERS_TTL_SECONDS = 60;

// Workspace-scoped task list (assignee + sub_tasks), optionally filtered by status.
// Pure function of (workspaceId, status) — identical for every member of the workspace.
export function getCachedWorkspaceTasks(workspaceId: string, status?: string) {
  return unstable_cache(
    async () =>
      prisma.taskLedger.findMany({
        where: { workspace_id: workspaceId, ...(status ? { status } : {}) },
        include: {
          assignee: { select: { id: true, full_name: true, email: true } },
          // Only the three fields consumed by TaskCard, TaskTableRow, and TaskDetailPanel
          sub_tasks: { select: { id: true, title: true, status: true } },
        },
        orderBy: { created_at: "desc" },
      }),
    // workspaceId/status are captured via closure, so they must be in the key parts
    ["workspace-tasks", workspaceId, status ?? "all"],
    { tags: [workspaceTasksTag(workspaceId)], revalidate: TASKS_TTL_SECONDS }
  )();
}

// Workspace-scoped member list with the per-workspace role merged onto each user.
export function getCachedWorkspaceMembers(workspaceId: string) {
  return unstable_cache(
    async () => {
      const memberships = await prisma.workspaceMember.findMany({
        where: { workspace_id: workspaceId },
        include: {
          user: { select: { id: true, full_name: true, email: true, role: true, image: true } },
        },
        orderBy: { joined_at: "asc" },
      });
      return memberships.map((m) => ({ ...m.user, workspace_role: m.role }));
    },
    ["workspace-members", workspaceId],
    { tags: [TAG_MEMBERS], revalidate: MEMBERS_TTL_SECONDS }
  )();
}

// Unscoped all-users list (admin fallback screens and partner presence).
export function getCachedAllMembers() {
  return unstable_cache(
    async () =>
      prisma.user.findMany({
        select: { id: true, full_name: true, email: true, role: true, image: true },
        orderBy: { full_name: "asc" },
      }),
    ["all-members"],
    { tags: [TAG_MEMBERS], revalidate: MEMBERS_TTL_SECONDS }
  )();
}

// { expire: 0 } expires tagged entries immediately so the next read is a fresh
// cache miss. These mutations run in Route Handlers (not Server Actions, so the
// read-your-own-writes updateTag is unavailable), and the caller refetches right
// after mutating — the stale-while-revalidate "max" profile would briefly serve
// the pre-mutation list, which is wrong for this interactive UX.
const EXPIRE_NOW = { expire: 0 } as const;

// Bust the cached task list for a single workspace after a task mutation.
export function revalidateWorkspaceTasks(workspaceId: string) {
  revalidateTag(workspaceTasksTag(workspaceId), EXPIRE_NOW);
}

// Bust every cached member list after a member is added, removed, renamed, or re-roled.
// Member writes are rare and few workspaces exist, so one global bust keeps invalidation simple.
export function revalidateMembers() {
  revalidateTag(TAG_MEMBERS, EXPIRE_NOW);
}
