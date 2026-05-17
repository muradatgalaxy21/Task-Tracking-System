// Server-only RBAC guards — never import this file from a client component.
// For client-safe role utilities, import from @/lib/rbac-utils instead.
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import type { UserRole } from "@/lib/types";
import { hasMinimumRole } from "@/lib/rbac-utils";

// Re-export so API routes only need one import
export { hasMinimumRole } from "@/lib/rbac-utils";
export { canManageBilling, canManageMembers, canCreateTasks, isReadOnly } from "@/lib/rbac-utils";

// Four-partner ownership structure for AI and Beyond
export const PARTNER_EMAILS = [
  "murad@ainandbeyond.com",
  "abdullah@ainandbeyond.com",
  "mujtaba@ainandbeyond.com",
  "abdulahad@ainandbeyond.com",
] as const;

export type SessionResult =
  | { session: Session; error: null }
  | { session: null; error: NextResponse };

// Returns the session if the user meets the minimum role requirement.
// Returns 401 if not authenticated, 403 if the role is insufficient.
export async function requireRole(minimumRole: UserRole): Promise<SessionResult> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!hasMinimumRole(session.user.role, minimumRole)) {
    return {
      session: null,
      error: NextResponse.json(
        { error: `Forbidden: requires ${minimumRole} role or higher` },
        { status: 403 }
      ),
    };
  }

  return { session, error: null };
}

// Shorthand: requires any authenticated session (Guest or above)
export async function requireAuth(): Promise<SessionResult> {
  return requireRole("Guest");
}
