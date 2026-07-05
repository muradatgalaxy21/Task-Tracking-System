import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, hasMinimumRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/monthly-close/last-closed?workspaceId=X
// Any authenticated workspace member. Returns only the end month/year of the most
// recent Finalized close (or null if none) — the boundary the member dashboard
// uses to compute its live cumulative window. No payout/score detail is exposed.
export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const isGlobalAdmin = hasMinimumRole(session.user.role, "Admin");
  if (!isGlobalAdmin) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
    }
  }

  try {
    const lastClose = await prisma.monthlyClose.findFirst({
      where: { workspace_id: workspaceId, status: "Finalized" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { year: true, month: true },
    });

    return NextResponse.json({ lastClosedEnd: lastClose ?? null });
  } catch (err) {
    console.error("Failed to fetch last closed month:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
