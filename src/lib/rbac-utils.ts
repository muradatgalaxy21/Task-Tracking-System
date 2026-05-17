// Client-safe RBAC utilities — no server imports, safe to use in client components.
import type { UserRole } from "@/lib/types";

// Role hierarchy: higher rank = more privileges
export const ROLE_RANK: Record<UserRole, number> = {
  Owner: 4,
  Admin: 3,
  Member: 2,
  Guest: 1,
};

// Returns true if the user's role meets or exceeds the required minimum
export function hasMinimumRole(userRole: string, minimumRole: UserRole): boolean {
  const userRank = ROLE_RANK[userRole as UserRole] ?? 0;
  const requiredRank = ROLE_RANK[minimumRole];
  return userRank >= requiredRank;
}

// Scoped permission helpers — use these in UI components and API routes
export const canManageBilling = (role: string) => hasMinimumRole(role, "Owner");
export const canManageMembers = (role: string) => hasMinimumRole(role, "Admin");
export const canCreateTasks = (role: string) => hasMinimumRole(role, "Member");
export const isReadOnly = (role: string) => role === "Guest";

// Returns whichever role has the higher rank.
// Use this to compute the effective permission level when a user has both a
// global role and a workspace-local role — the higher one wins.
export function resolveEffectiveRole(globalRole: string, workspaceRole: string | null | undefined): string {
  if (!workspaceRole) return globalRole;
  const globalRank = ROLE_RANK[globalRole as UserRole] ?? 0;
  const localRank = ROLE_RANK[workspaceRole as UserRole] ?? 0;
  return localRank > globalRank ? workspaceRole : globalRole;
}
