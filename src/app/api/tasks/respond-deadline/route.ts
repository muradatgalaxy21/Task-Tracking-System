import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/rbac";
import { resolveEffectiveRole } from "@/lib/rbac-utils";
import { writeAuditLog } from "@/lib/audit";
import { revalidateWorkspaceTasks } from "@/lib/cache";

export const dynamic = "force-dynamic";

// POST /api/tasks/respond-deadline - Approve or reject a manager's deadline update request
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { notification_id, action } = await req.json();

    // 1. Parameter Validation: Ensure necessary request properties are present and valid.
    if (!notification_id || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    // 2. Query Notification: Fetch the target request notification from database.
    const notification = await prisma.notification.findUnique({
      where: { id: notification_id },
    });

    if (!notification || notification.type !== "deadline_request") {
      return NextResponse.json({ error: "Request notification not found" }, { status: 404 });
    }

    // 3. Parse Request Payload: Decode JSON payload embedded inside the notification message field.
    let requestDetails;
    try {
      requestDetails = JSON.parse(notification.message);
    } catch (e) {
      return NextResponse.json({ error: "Invalid request payload format" }, { status: 400 });
    }

    const { task_id, proposed_deadline, status } = requestDetails;

    // 4. State Verification: Ensure the request is still pending action.
    if (status !== "pending") {
      return NextResponse.json({ error: "This request has already been processed" }, { status: 400 });
    }

    // 5. Query Task Ledger: Confirm that the target task exists to find its workspace.
    const task = await prisma.taskLedger.findUnique({
      where: { task_id },
      select: { workspace_id: true, title: true, max_deadline: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Target task not found" }, { status: 404 });
    }

    // 6. Access Control: Verify that the current user has Owner/Admin permissions in the target workspace.
    const globalRole = session.user.role || "Member";
    let effectiveRole = globalRole;

    if (task.workspace_id) {
      const membership = await prisma.workspaceMember.findUnique({
        where: { workspace_id_user_id: { workspace_id: task.workspace_id, user_id: session.user.id } },
      });
      if (!membership) {
        return NextResponse.json({ error: "Forbidden: Not a workspace member" }, { status: 403 });
      }
      effectiveRole = resolveEffectiveRole(globalRole, membership.role);
    }

    const isAdmin = hasMinimumRole(effectiveRole, "Admin");
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden: Requires Admin or Owner role" }, { status: 403 });
    }

    const approver = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { full_name: true, email: true },
    });
    const approverName = approver?.full_name || approver?.email || "Admin";

    // 7. Transactional Mutate: Execute task deadline update and activity feed logging.
    if (action === "approve") {
      await prisma.$transaction([
        prisma.taskLedger.update({
          where: { task_id },
          data: { max_deadline: new Date(proposed_deadline) },
        }),
        prisma.taskActivity.create({
          data: {
            task_id,
            user_id: session.user.id,
            actor_name: approverName,
            type: "field_update",
            content: `approved deadline change to ${new Date(proposed_deadline).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} (requested by ${requestDetails.requester_name})`,
            metadata: JSON.stringify({ old_deadline: task.max_deadline, new_deadline: proposed_deadline }),
          },
        }),
      ]);

      // Write direct changes to database audit trail logs.
      writeAuditLog({
        workspace_id: task.workspace_id,
        user_id: session.user.id,
        actor_name: approverName,
        actor_email: approver?.email,
        event_type: "task_edited",
        entity_id: task_id,
        entity_name: task.title,
        metadata: {
          field: "max_deadline",
          old_value: task.max_deadline.toISOString(),
          new_value: new Date(proposed_deadline).toISOString(),
          action: "approve",
        },
      });
    }

    // 8. Update Duplicate Notifications: Update and mark as read all matching notifications for this request in the DB.
    const allNotifications = await prisma.notification.findMany({
      where: {
        task_id,
        type: "deadline_request",
      },
    });

    for (const notif of allNotifications) {
      try {
        const details = JSON.parse(notif.message);
        if (details.proposed_deadline === proposed_deadline && details.status === "pending") {
          details.status = action === "approve" ? "approved" : "rejected";
          await prisma.notification.update({
            where: { id: notif.id },
            data: { message: JSON.stringify(details), read: true },
          });
        }
      } catch (e) {
        // Skip malformed payloads
      }
    }

    // Bust the task cache for this workspace to trigger fresh fetches in clients
    if (task.workspace_id) {
      revalidateWorkspaceTasks(task.workspace_id);
    }

    return NextResponse.json({ success: true, status: action === "approve" ? "approved" : "rejected" });
  } catch (error) {
    console.error("Failed to respond to deadline request:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
