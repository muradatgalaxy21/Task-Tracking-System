import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, hasMinimumRole } from "@/lib/rbac";
import { calculatePayouts } from "@/lib/calculations";
import { computeMemberScores } from "@/lib/monthly-close";

export const dynamic = "force-dynamic";

// GET /api/monthly-close/[id]
// Returns the full close record with member payouts. Admin+ only.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole("Admin");
  if (error) return error;

  const { id } = await params;

  try {
    const close = await prisma.monthlyClose.findUnique({
      where: { id },
      include: {
        payouts: true,
        workspace: { select: { id: true, name: true } },
      },
    });

    if (!close) {
      return NextResponse.json({ error: "Monthly close not found" }, { status: 404 });
    }

    // Global Admin/Owner bypasses membership check
    if (!hasMinimumRole(session.user.role, "Admin")) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: { workspace_id: close.workspace_id, user_id: session.user.id },
        },
      });
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Enrich payouts with user names
    const userIds = close.payouts.map((p) => p.user_id);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, full_name: true, email: true },
    });

    const enrichedPayouts = close.payouts.map((p) => {
      const user = users.find((u) => u.id === p.user_id);
      return {
        ...p,
        user_name: user?.full_name ?? user?.email ?? "Unknown",
      };
    });

    return NextResponse.json({ ...close, payouts: enrichedPayouts });
  } catch (err) {
    console.error("Failed to fetch monthly close:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/monthly-close/[id]
// Updates a Draft close. Owner only.
// Accepts: { totalRevenue, scheduledDays, multiplierOverrides, action: "recalculate" | "finalize" }
// - "recalculate": recompute scores + payouts from stored data with any overrides applied
// - "finalize": lock the close (status -> Finalized)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireRole("Owner");
  if (error) return error;

  const { id } = await params;

  try {
    const body = await req.json();
    const { totalRevenue, scheduledDays, multiplierOverrides, action } = body;

    const close = await prisma.monthlyClose.findUnique({
      where: { id },
      include: { payouts: true },
    });

    if (!close) {
      return NextResponse.json({ error: "Monthly close not found" }, { status: 404 });
    }

    if (close.status === "Finalized" && action !== undefined) {
      return NextResponse.json(
        { error: "This close has already been finalized and cannot be changed." },
        { status: 409 }
      );
    }

    // Global Owner bypasses membership check for PATCH operations
    if (!hasMinimumRole(session.user.role, "Owner")) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: { workspace_id: close.workspace_id, user_id: session.user.id },
        },
      });
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (action === "finalize") {
      // Lock the close
      const updated = await prisma.monthlyClose.update({
        where: { id },
        data: { status: "Finalized", finalized_at: new Date() },
      });
      return NextResponse.json(updated);
    }

    // "recalculate" or plain update — recompute payouts with new revenue/overrides
    const newRevenue = totalRevenue ?? close.total_revenue;
    const newScheduledDays = scheduledDays ?? close.scheduled_days;

    // Merge existing per-member overrides with any new ones from the request
    const globalOverrides: Record<string, number> = multiplierOverrides ?? {};

    const { month, year, workspace_id } = close;
    const memberIds = close.payouts.map((p) => p.user_id);

    // Build per-user merged overrides (stored per-payout overrides + incoming global ones)
    // and an index from user_id back to the payout row we must update.
    const overridesByUser: Record<string, Record<string, number>> = {};
    const payoutByUserId = new Map<string, (typeof close.payouts)[number]>();
    for (const p of close.payouts) {
      let storedOverrides: Record<string, number> = {};
      try {
        storedOverrides = JSON.parse(p.multiplier_overrides || "{}");
      } catch {
        storedOverrides = {};
      }
      overridesByUser[p.user_id] = { ...storedOverrides, ...globalOverrides };
      payoutByUserId.set(p.user_id, p);
    }

    // Resolve display names for the payout breakdown, keyed by user_id
    const users = await prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, full_name: true, email: true },
    });
    const nameByUserId = new Map(
      users.map((u) => [u.id, u.full_name ?? u.email ?? "Unknown"])
    );

    // Recompute TPS/AS/total per member via the shared aggregation (batched, timezone-safe),
    // applying the merged multiplier overrides non-destructively
    const memberScores = await computeMemberScores({
      workspaceId: workspace_id,
      memberIds,
      year,
      month,
      scheduledDays: newScheduledDays,
      overridesByUser,
    });

    const payoutResults = calculatePayouts(
      memberScores.map((ms) => ({
        memberId: ms.userId,
        memberName: nameByUserId.get(ms.userId) ?? "Unknown",
        totalScore: ms.totalScore,
      })),
      newRevenue
    );

    // Persist the close metadata and every updated payout in a single batched
    // transaction (array form) rather than one awaited update per member
    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.monthlyClose.update({
        where: { id },
        data: { total_revenue: newRevenue, scheduled_days: newScheduledDays },
      }),
    ];

    for (const ms of memberScores) {
      const payoutRow = payoutByUserId.get(ms.userId);
      if (!payoutRow) continue;
      const payout = payoutResults.find((p) => p.memberId === ms.userId);
      writes.push(
        prisma.memberMonthlyPayout.update({
          where: { id: payoutRow.id },
          data: {
            tps_score: ms.tpsScore,
            as_score: ms.asScore,
            total_score: ms.totalScore,
            base_payout: payout?.basePayout ?? 0,
            perf_payout: payout?.perfPayout ?? 0,
            final_payout: payout?.finalPayout ?? 0,
            present_days: ms.presentDays,
            scheduled_days: newScheduledDays,
            multiplier_overrides: JSON.stringify(overridesByUser[ms.userId] ?? {}),
          },
        })
      );
    }

    await prisma.$transaction(writes);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to update monthly close:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
