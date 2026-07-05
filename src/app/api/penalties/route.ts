import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEffectiveRole, hasMinimumRole } from "@/lib/rbac-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/penalties?workspaceId=X&userId=Y
 * Lists penalties for a member in a workspace.
 *
 * 1. Verify user session.
 * 2. Verify workspace membership to enforce isolation.
 * 3. Fetch penalties for the member.
 */
export async function GET(req: Request) {
  // 1. Authenticate session.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const userId = searchParams.get("userId");

  if (!workspaceId || !userId) {
    return NextResponse.json({ error: "workspaceId and userId are required" }, { status: 400 });
  }

  try {
    // 2. Verify the caller belongs to the target workspace.
    const callerMembership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
    });
    if (!callerMembership && session.user.role !== "Admin" && session.user.role !== "Owner") {
      return NextResponse.json({ error: "Forbidden: Not a workspace member" }, { status: 403 });
    }

    // 3. Retrieve penalties from the database.
    const penalties = await prisma.penalty.findMany({
      where: { workspace_id: workspaceId, user_id: userId },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(penalties);
  } catch (error) {
    console.error("Failed to fetch penalties:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/penalties
 * Creates a new penalty for a member.
 * Only workspace Owners can create penalties.
 *
 * 1. Verify caller session.
 * 2. Verify caller has Owner permissions in the workspace.
 * 3. Save penalty in the database.
 */
export async function POST(req: Request) {
  // 1. Authenticate session.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId, userId, amount, reason, month, year } = await req.json();

    if (!workspaceId || !userId || amount == null || !reason || month == null || year == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 2. Retrieve caller workspace membership and determine effective role.
    const callerMembership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
    });
    const globalRole = session.user.role || "Member";
    const effectiveRole = resolveEffectiveRole(globalRole, callerMembership?.role);

    // Verify workspace Owner authority.
    if (!hasMinimumRole(effectiveRole, "Owner")) {
      return NextResponse.json({ error: "Forbidden: Only Owners can manage penalties" }, { status: 403 });
    }

    // 3. Create the penalty record in the database.
    const penalty = await prisma.penalty.create({
      data: {
        workspace_id: workspaceId,
        user_id: userId,
        amount: parseFloat(amount),
        reason,
        month: parseInt(month),
        year: parseInt(year),
        created_by: session.user.id,
      },
    });

    return NextResponse.json(penalty);
  } catch (error) {
    console.error("Failed to create penalty:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH /api/penalties
 * Updates a penalty (amount, reason, month, year).
 * Only workspace Owners can update penalties.
 *
 * 1. Verify caller session.
 * 2. Fetch the existing penalty to identify its workspace.
 * 3. Verify caller has Owner permissions in that workspace.
 * 4. Save updates to the database.
 */
export async function PATCH(req: Request) {
  // 1. Authenticate session.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, amount, reason, month, year } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Penalty ID is required" }, { status: 400 });
    }

    // 2. Fetch the target penalty to retrieve workspace context.
    const targetPenalty = await prisma.penalty.findUnique({
      where: { id },
    });
    if (!targetPenalty) {
      return NextResponse.json({ error: "Penalty not found" }, { status: 404 });
    }

    // 3. Retrieve caller workspace membership and determine effective role.
    const callerMembership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: targetPenalty.workspace_id, user_id: session.user.id } },
    });
    const globalRole = session.user.role || "Member";
    const effectiveRole = resolveEffectiveRole(globalRole, callerMembership?.role);

    // Verify workspace Owner authority.
    if (!hasMinimumRole(effectiveRole, "Owner")) {
      return NextResponse.json({ error: "Forbidden: Only Owners can manage penalties" }, { status: 403 });
    }

    // 4. Update the penalty record.
    const updated = await prisma.penalty.update({
      where: { id },
      data: {
        amount: amount != null ? parseFloat(amount) : undefined,
        reason: reason || undefined,
        month: month != null ? parseInt(month) : undefined,
        year: year != null ? parseInt(year) : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update penalty:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/penalties?id=X
 * Deletes a penalty.
 * Only workspace Owners can delete penalties.
 *
 * 1. Verify caller session.
 * 2. Fetch the target penalty to identify its workspace.
 * 3. Verify caller has Owner permissions in that workspace.
 * 4. Remove penalty from the database.
 */
export async function DELETE(req: Request) {
  // 1. Authenticate session.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Penalty ID is required" }, { status: 400 });
  }

  try {
    // 2. Fetch target penalty to check workspace context.
    const targetPenalty = await prisma.penalty.findUnique({
      where: { id },
    });
    if (!targetPenalty) {
      return NextResponse.json({ error: "Penalty not found" }, { status: 404 });
    }

    // 3. Retrieve caller workspace membership and determine effective role.
    const callerMembership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: targetPenalty.workspace_id, user_id: session.user.id } },
    });
    const globalRole = session.user.role || "Member";
    const effectiveRole = resolveEffectiveRole(globalRole, callerMembership?.role);

    // Verify workspace Owner authority.
    if (!hasMinimumRole(effectiveRole, "Owner")) {
      return NextResponse.json({ error: "Forbidden: Only Owners can manage penalties" }, { status: 403 });
    }

    // 4. Delete from database.
    await prisma.penalty.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete penalty:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
