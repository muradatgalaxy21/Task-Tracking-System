import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/rbac";
import { resolveEffectiveRole } from "@/lib/rbac-utils";

export const dynamic = "force-dynamic";

// Allowed attendance states — reject anything else so callers cannot store
// arbitrary strings that would corrupt the scoring engine's day counting.
const VALID_ATTENDANCE_STATUSES = ["Present", "Late", "Absent"] as const;

// Normalize a YYYY-MM-DD (or ISO) string to UTC midnight. Using UTC (not the
// server's local midnight) keeps the (user_id, date) key identical whether the
// row is written from a UTC serverless function or a non-UTC dev machine.
function toUtcMidnight(input: string | undefined): Date {
  const day = (input ?? new Date().toISOString()).slice(0, 10);
  return new Date(`${day}T00:00:00.000Z`);
}

// GET /api/attendance - Fetch attendance records
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const user_id = searchParams.get("user_id");
  const workspaceId = searchParams.get("workspaceId");

  const isAdmin = hasMinimumRole(session.user.role, "Admin");

  try {
    // When workspaceId is provided, resolve member IDs so we only return
    // attendance records belonging to workspace members.
    let workspaceMemberIds: string[] | undefined;
    if (workspaceId) {
      // Enforce isolation — only members of the workspace (or an Admin) may read its attendance.
      if (!isAdmin) {
        const callerMembership = await prisma.workspaceMember.findUnique({
          where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
          select: { user_id: true },
        });
        if (!callerMembership) {
          return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
        }
      }
      const members = await prisma.workspaceMember.findMany({
        where: { workspace_id: workspaceId },
        select: { user_id: true },
      });
      workspaceMemberIds = members.map((m) => m.user_id);
    }

    // Without a workspace scope, a non-Admin may only read their own attendance —
    // otherwise the query would return every user's records.
    const selfScope = !workspaceId && !isAdmin ? session.user.id : undefined;

    const attendance = await prisma.dailyAttendance.findMany({
      where: {
        AND: [
          ...(date ? [{ date: new Date(date) }] : []),
          ...(selfScope ? [{ user_id: selfScope }] : user_id ? [{ user_id }] : []),
          ...(workspaceMemberIds ? [{ user_id: { in: workspaceMemberIds } }] : []),
        ]
      },
      orderBy: {
        date: "desc",
      },
      include: {
        user: {
          select: {
            full_name: true,
            email: true,
          }
        }
      }
    });

    return NextResponse.json(attendance);
  } catch (error) {
    console.error("Failed to fetch attendance:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/attendance - Log attendance (handles batch upsert).
// Body: { workspaceId, records: [{ user_id, date, status }] }
//   or  { workspaceId, user_id?, date?, status } for a single record.
// The workspace scope is mandatory: it is how the write is authorized and how
// target users are constrained, since DailyAttendance itself has no workspace_id.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // 1. A workspace scope is required to authorize the write and bound its targets.
    const workspaceId: string | undefined = body?.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // 2. Authorize against the caller's effective role in THIS workspace (workspace
    //    Admins can log for their own workspace; a global Admin still qualifies).
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: session.user.id } },
      select: { role: true },
    });
    const effectiveRole = resolveEffectiveRole(session.user.role || "Member", membership?.role);
    if (!hasMinimumRole(effectiveRole, "Admin")) {
      return NextResponse.json(
        { error: "Only workspace Admins and Owners can log attendance" },
        { status: 403 }
      );
    }

    // 3. Build the set of user IDs that belong to this workspace. Attendance may
    //    only be written for these members — this blocks cross-tenant writes.
    const memberRows = await prisma.workspaceMember.findMany({
      where: { workspace_id: workspaceId },
      select: { user_id: true },
    });
    const memberIds = new Set(memberRows.map((m) => m.user_id));

    // 4. Normalize the request into a list of records regardless of batch/single shape.
    const rawRecords: Array<{ user_id?: string; date?: string; status?: string }> =
      Array.isArray(body.records)
        ? body.records
        : [{ user_id: body.user_id, date: body.date, status: body.status }];

    if (rawRecords.length === 0) {
      return NextResponse.json({ error: "No attendance records provided" }, { status: 400 });
    }

    // 5. Validate every record: known status, and a target that is a workspace member.
    const upserts = [];
    for (const record of rawRecords) {
      const targetUserId = record.user_id || session.user.id;

      if (!record.status || !VALID_ATTENDANCE_STATUSES.includes(record.status as (typeof VALID_ATTENDANCE_STATUSES)[number])) {
        return NextResponse.json({ error: "Invalid attendance status" }, { status: 400 });
      }
      if (!memberIds.has(targetUserId)) {
        return NextResponse.json(
          { error: "Cannot log attendance for a user outside this workspace" },
          { status: 403 }
        );
      }

      const attendanceDate = toUtcMidnight(record.date);
      upserts.push(
        prisma.dailyAttendance.upsert({
          where: { user_id_date: { user_id: targetUserId, date: attendanceDate } },
          update: { status: record.status },
          create: { user_id: targetUserId, date: attendanceDate, status: record.status },
        })
      );
    }

    // 6. Apply all writes atomically so a partial save can never occur.
    const results = await prisma.$transaction(upserts);

    return NextResponse.json(
      Array.isArray(body.records) ? { success: true } : results[0]
    );
  } catch (error) {
    console.error("Failed to log attendance:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
