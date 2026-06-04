import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/user/payout-balance?workspaceId=X
// Returns the current user's finalized payout from the latest MonthlyClose
// for the specified workspace. Returns null if no finalized close exists yet.
export async function GET(req: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ balance: null });
  }

  try {
    // Find the most recent finalized close for this workspace
    const latestClose = await prisma.monthlyClose.findFirst({
      where: { workspace_id: workspaceId, status: "Finalized" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    if (!latestClose) {
      return NextResponse.json({ balance: null, label: null });
    }

    // Find this user's payout in that close
    const payout = await prisma.memberMonthlyPayout.findFirst({
      where: { close_id: latestClose.id, user_id: session.user.id },
    });

    if (!payout) {
      return NextResponse.json({ balance: null, label: latestClose.label });
    }

    return NextResponse.json({
      balance: payout.final_payout,
      label: latestClose.label,
      tps_score: payout.tps_score,
      as_score: payout.as_score,
      total_score: payout.total_score,
    });
  } catch (err) {
    console.error("Failed to fetch payout balance:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
