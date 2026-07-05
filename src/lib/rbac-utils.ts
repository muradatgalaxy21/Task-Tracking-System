// Client-safe RBAC utilities — no server imports, safe to use in client components.
import type { UserRole } from "@/lib/types";

// Role hierarchy: higher rank = more privileges.
// Manager sits between Member and Admin — can create/name tasks but cannot approve them.
export const ROLE_RANK: Record<UserRole, number> = {
  Owner:   5,
  Admin:   4,
  Manager: 3,
  Member:  2,
  Guest:   1,
};

// Returns true if the user's role meets or exceeds the required minimum
export function hasMinimumRole(userRole: string, minimumRole: UserRole): boolean {
  const userRank = ROLE_RANK[userRole as UserRole] ?? 0;
  const requiredRank = ROLE_RANK[minimumRole];
  return userRank >= requiredRank;
}

// Scoped permission helpers — use these in UI components and API routes
export const canManageBilling  = (role: string) => hasMinimumRole(role, "Owner");
export const canManageMembers  = (role: string) => hasMinimumRole(role, "Admin");
// Managers and above can create tasks and edit task titles
export const canCreateTasks    = (role: string) => hasMinimumRole(role, "Manager");
export const canEditTaskTitle  = (role: string) => hasMinimumRole(role, "Manager");
// Members and above can edit metadata fields (description, notes, attachments)
export const canEditMetadata   = (role: string) => hasMinimumRole(role, "Member");
export const isReadOnly        = (role: string) => role === "Guest";

// Returns whichever role has the higher rank.
// Use this when a user has both a global role and a workspace-local role — the higher one wins.
export function resolveEffectiveRole(globalRole: string, workspaceRole: string | null | undefined): string {
  if (!workspaceRole) return globalRole;
  const globalRank = ROLE_RANK[globalRole as UserRole] ?? 0;
  const localRank  = ROLE_RANK[workspaceRole as UserRole] ?? 0;
  return localRank > globalRank ? workspaceRole : globalRole;
}

/**
 * Client-safe permission resolver that takes custom overrides into account.
 *
 * 1. Check if there is an explicit client-side override in the active workspace.
 * 2. Fall back to standard role-based hierarchy values.
 */
export function hasPermissionClient(
  overrides: Record<string, boolean> | undefined | null,
  permission: string,
  effectiveRole: string
): boolean {
  // 1. Return the explicit allowed flag if present in the overrides map.
  if (overrides && overrides[permission] !== undefined) {
    return overrides[permission];
  }

  // 2. Perform fallback checks based on the default role hierarchy.
  switch (permission) {
    case "task:create":
      return hasMinimumRole(effectiveRole, "Manager");
    case "task:edit_title":
      return hasMinimumRole(effectiveRole, "Manager");
    case "task:edit_deadline":
      return hasMinimumRole(effectiveRole, "Manager");
    case "task:edit_metadata":
      return hasMinimumRole(effectiveRole, "Member");
    case "task:delete":
      return hasMinimumRole(effectiveRole, "Admin");
    case "announcement:manage":
      return hasMinimumRole(effectiveRole, "Admin");
    case "finance:view":
      return hasMinimumRole(effectiveRole, "Admin");
    default:
      return false;
  }
}

