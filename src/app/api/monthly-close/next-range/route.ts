import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, hasMinimumRole } from "@/lib/rbac";
import { determineAutoCloseEnd, determineAutoCloseStart } from "@/lib/close-range";
import { getWorkspaceCloseContext } from "@/lib/monthly-close";

export const dynamic = "force-dynamic";

// GET /api/monthly-close/next-range?workspaceId=X
// Owner only. Returns:
//   - closedMonths: every "YYYY-MM" key already covered by an existing close
//     (Draft or Finalized) in this workspace, for disabling in the manual picker.
//   - suggestedStart / suggestedEnd: the auto-detected span — from the month after
//     the last Finalized close (or the earliest activity month if none), through
//     the current month (included only if today is day 28 or later).
export async function GET(req: Request) {
  const { session, error } = await requireRole("Owner");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const isGlobalOwner = hasMinimumRole(session.user.role, "Owner");
  if (!isGlobalOwner) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }
  }

  try {
    const { closedMonths, lastFinalizedEnd, earliestActivityMonth } =
      await getWorkspaceCloseContext(workspaceId);

    const suggestedEnd = determineAutoCloseEnd();
    const suggestedStart = determineAutoCloseStart(lastFinalizedEnd, earliestActivityMonth, suggestedEnd);

    return NextResponse.json({
      closedMonths: Array.from(closedMonths),
      suggestedStart,
      suggestedEnd,
    });
  } catch (err) {
    console.error("Failed to compute next close range:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
