import { prisma } from "@/lib/prisma";
import { hasMinimumRole } from "./rbac-utils";

/**
 * Checks if a user has permission to perform a specific action in a workspace.
 * Uses explicit database overrides first, then falls back to static role mapping.
 *
 * 1. Query the database for any override settings matching the user, workspace, and permission.
 * 2. Return the custom override value if it has been explicitly set.
 * 3. Fall back to checking standard roles based on the permission type.
 */
export async function hasPermission(
  userId: string,
  workspaceId: string,
  permission: string,
  effectiveRole: string
): Promise<boolean> {
  // 1. Fetch override record from the database.
  const override = await prisma.memberPermission.findUnique({
    where: {
      workspace_id_user_id_permission: {
        workspace_id: workspaceId,
        user_id: userId,
        permission,
      },
    },
  });

  // 2. If an override setting exists, return the explicit allowed value.
  if (override !== null) {
    return override.allowed;
  }

  // 3. Fall back to default role rank validations.
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
