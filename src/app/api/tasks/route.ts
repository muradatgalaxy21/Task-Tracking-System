import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { TaskLedger } from "@prisma/client";
import { hasMinimumRole } from "@/lib/rbac";
import { resolveEffectiveRole } from "@/lib/rbac-utils";
import { STATUS_LABELS } from "@/lib/types";
import { writeAuditLog } from "@/lib/audit";
import { sendTaskCreatedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Returns the WorkspaceMember record or null if the user is not in the workspace.
async function getWorkspaceMembership(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
  });
}

// GET /api/tasks?workspaceId=X - Fetch tasks scoped to the active workspace
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspace_id = searchParams.get("workspaceId");
  const status       = searchParams.get("status");

  // Return empty rather than leaking cross-workspace data when no workspace is selected
  if (!workspace_id) {
    return NextResponse.json([]);
  }

  const membership = await getWorkspaceMembership(workspace_id, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  try {
    const tasks = await prisma.taskLedger.findMany({
      where: {
        workspace_id,
        ...(status ? { status } : {}),
      },
      include: {
        assignee: { select: { id: true, full_name: true, email: true } },
        // Only the three fields consumed by TaskCard, TaskTableRow, and TaskDetailPanel
        sub_tasks: { select: { id: true, title: true, status: true } },
      },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/tasks - Create a new task (Manager or above only)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      title,
      description,
      assignee_id,
      workspace_id,
      estimated_days,
      priority,
      max_deadline,
      ai_model_used,
      benchmark_score,
      repo_link,
    } = body;

    if (!title || !assignee_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const globalRole = session.user.role || "Member";
    let effectiveRole = globalRole;

    if (workspace_id) {
      const membership = await getWorkspaceMembership(workspace_id, session.user.id);
      if (!membership) {
        return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
      }
      effectiveRole = resolveEffectiveRole(globalRole, membership.role);
    }

    // Only Managers and above can create tasks
    if (!hasMinimumRole(effectiveRole, "Manager")) {
      return NextResponse.json(
        { error: "Only Managers and above can create tasks" },
        { status: 403 }
      );
    }

    // 1. Read recurrence settings (interval in hours, repeat count) from the request body.
    const repeatEnabled = !!body.repeat_enabled;
    const repeatInterval = body.repeat_interval ? Number(body.repeat_interval) : 24;
    const repeatCount = body.repeat_count ? Number(body.repeat_count) : 5;

    // 2. Validate recurrence inputs to prevent invalid interval or count values.
    if (repeatEnabled) {
      if (isNaN(repeatInterval) || repeatInterval <= 0) {
        return NextResponse.json({ error: "Invalid repeat interval" }, { status: 400 });
      }
      if (isNaN(repeatCount) || repeatCount < 1) {
        return NextResponse.json({ error: "Invalid repeat count" }, { status: 400 });
      }
    }

    const creator = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { full_name: true, email: true },
    });
    const actorName = creator?.full_name || creator?.email || "Unknown";

    // 1. Retrieve the assignee details. Verify their existence before task creation.
    const assignee = await prisma.user.findUnique({
      where: { id: assignee_id },
      select: { full_name: true, email: true },
    });
    if (!assignee) {
      return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
    }

    // 2. Fetch the workspace name if workspace_id is provided. Fallback to Personal Tasks if not.
    let workspaceName = "Personal Tasks";
    if (workspace_id) {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspace_id },
        select: { name: true },
      });
      if (ws) {
        workspaceName = ws.name;
      }
    }

    const baseDeadline = max_deadline
      ? new Date(max_deadline)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 3. Build the tasks list. For recurring tasks, increment deadlines and format titles as "Title X/Y" (e.g. "Review Design 1/5").
    const tasksToCreate: { title: string; deadline: Date }[] = [];
    if (repeatEnabled) {
      for (let i = 0; i < repeatCount; i++) {
        const taskDeadline = new Date(baseDeadline.getTime() + i * repeatInterval * 60 * 60 * 1000);
        const taskTitle = `${title} ${i + 1}/${repeatCount}`;
        tasksToCreate.push({
          title: taskTitle,
          deadline: taskDeadline,
        });
      }
    } else {
      tasksToCreate.push({
        title,
        deadline: baseDeadline,
      });
    }

    // Track the first task created in the batch to return it in the response
    let firstCreatedTask: TaskLedger | null = null;

    // 4. Execute atomic database insertions for all tasks inside a transaction block.
    // 1. Transaction isolates the creation of multiple tasks.
    // 2. Timeout is set to 30000ms to prevent connection drops in slow network scenarios.
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < tasksToCreate.length; i++) {
        const item = tasksToCreate[i];
        const created = await tx.taskLedger.create({
          data: {
            title: item.title,
            description: description || "",
            assignee_id,
            workspace_id: workspace_id || null,
            estimated_days: estimated_days || 1,
            priority: priority || "Medium",
            max_deadline: item.deadline,
            status: "Todo",
            ai_model_used: ai_model_used || null,
            benchmark_score: benchmark_score || null,
            repo_link: repo_link || null,
          },
        });

        if (i === 0) {
          firstCreatedTask = created;
        }

        // 5. Dispatch task creation audit logs (fire-and-forget).
        writeAuditLog({
          workspace_id: workspace_id || null,
          user_id: session.user.id,
          actor_name: actorName,
          actor_email: creator?.email,
          event_type: "task_created",
          entity_id: created.task_id,
          entity_name: created.title,
        });
      }
    }, { timeout: 30000 });

    // 6. Send the assignment email. Check if email exists on assignee, and send a consolidated batch alert.
    if (assignee.email) {
      const emailTasks = tasksToCreate.map((t) => ({
        title: t.title,
        description: description || "",
        deadline: t.deadline,
        priority: priority || "Medium",
        estimatedDays: estimated_days || 1,
      }));

      // Wrap async email call with catches to prevent unhandled rejection crashes.
      sendTaskCreatedEmail({
        toEmail: assignee.email,
        toName: assignee.full_name || assignee.email.split("@")[0],
        creatorName: actorName,
        workspaceName,
        taskDetails: emailTasks,
      }).catch((err) => {
        console.error("Async task created email notification failed:", err);
      });
    }

    return NextResponse.json(firstCreatedTask);
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/tasks - Update task fields with granular permission checks
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      task_id,
      title,
      status,
      multiplier_earned,
      description,
      ai_model_used,
      benchmark_score,
      repo_link,
      technical_requirements,
      architecture_notes,
      estimated_hours,
      actual_hours,
      attachments,
    } = body;

    if (!task_id) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
    }

    const globalRole = session.user.role || "Member";

    const currentTask = await prisma.taskLedger.findUnique({
      where: { task_id },
      select: { title: true, status: true, workspace_id: true, assignee_id: true, review_submitted_at: true },
    });

    if (!currentTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Resolve effective role (workspace role takes precedence if higher)
    let effectiveRole = globalRole;
    if (currentTask.workspace_id) {
      const membership = await getWorkspaceMembership(currentTask.workspace_id, session.user.id);
      if (!membership) {
        return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
      }
      effectiveRole = resolveEffectiveRole(globalRole, membership.role);
    }

    const isAssignee = currentTask.assignee_id === session.user.id;
    const isAdmin    = hasMinimumRole(effectiveRole, "Admin");
    const isManager  = hasMinimumRole(effectiveRole, "Manager");

    // Review lock: only Admins can make any change once a task is In Review
    if (currentTask.status === "In Review" && !isAdmin) {
      return NextResponse.json(
        { error: "This task is locked for review. Only Admins can make changes." },
        { status: 403 }
      );
    }

    // Title editing is restricted to Managers and above
    if (title !== undefined && !isManager) {
      return NextResponse.json(
        { error: "Only Managers and above can edit the task title" },
        { status: 403 }
      );
    }

    // Metadata editing (description, notes, etc.) requires at least Member rank,
    // and only the assignee or an Admin can do it
    const isEditingMetadata = [
      description, technical_requirements, architecture_notes,
      estimated_hours, actual_hours, attachments, ai_model_used,
      benchmark_score, repo_link,
    ].some((v) => v !== undefined);

    if (isEditingMetadata && !isAdmin && !isAssignee) {
      return NextResponse.json(
        { error: "Only the assignee or an Admin can edit task metadata" },
        { status: 403 }
      );
    }

    // Status transition rules
    if (status !== undefined) {
      const validStatuses = ["Todo", "In Progress", "In Review", "Completed", "Not Done", "Discarded"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      // Only Admin/Owner can move to Completed, Not Done, or Discarded (terminal states)
      if ((status === "Completed" || status === "Not Done" || status === "Discarded") && !isAdmin) {
        return NextResponse.json(
          { error: "Only Admins and Owners can set Completed, Not Done, or Discarded status" },
          { status: 403 }
        );
      }
    }

    // Capture the moment the member submits for review (only on first transition to In Review).
    // This timestamp is used instead of completed_at for fair multiplier calculation,
    // so admin delay in approving does not penalise the member.
    const setReviewSubmittedAt =
      status === "In Review" &&
      currentTask.status !== "In Review" &&
      !currentTask.review_submitted_at
        ? { review_submitted_at: new Date() }
        : {};

    // When a task is reverted from a terminal/review state, wipe stale timing data
    // so any subsequent completion is judged on fresh timing — not a stale review timestamp.
    const terminalStatuses = ["Completed", "Not Done", "Discarded"];

    const revertResetData: Record<string, unknown> = {};
    if (status !== undefined && status !== currentTask.status) {
      if (
        (currentTask.status === "Completed" || currentTask.status === "Not Done") &&
        !terminalStatuses.includes(status)
      ) {
        // Re-opening a completed/not-done task: clear all completion tracking
        revertResetData.completed_at = null;
        revertResetData.multiplier_earned = null;
        revertResetData.review_submitted_at = null;
      } else if (
        currentTask.status === "In Review" &&
        status !== "In Review" &&
        !terminalStatuses.includes(status)
      ) {
        // Sent back from review for rework: clear the review timestamp
        // so the next review submission is treated as a fresh attempt
        revertResetData.review_submitted_at = null;
      }
    }

    // Build the shared data object for the task update
    const taskUpdateData = {
      ...(title !== undefined ? { title } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(multiplier_earned !== undefined ? { multiplier_earned } : {}),
      // Completed: multiplier calculated from timing; Not Done: explicit 0 (task closed but not performed)
      ...(status === "Completed" ? { completed_at: new Date() } : {}),
      ...(status === "Not Done" ? { completed_at: new Date(), multiplier_earned: 0 } : {}),
      ...setReviewSubmittedAt,
      ...revertResetData,
      ...(description !== undefined ? { description } : {}),
      ...(ai_model_used !== undefined ? { ai_model_used: ai_model_used || null } : {}),
      ...(benchmark_score !== undefined ? { benchmark_score: benchmark_score || null } : {}),
      ...(repo_link !== undefined ? { repo_link: repo_link || null } : {}),
      ...(technical_requirements !== undefined ? { technical_requirements } : {}),
      ...(architecture_notes !== undefined ? { architecture_notes } : {}),
      ...(estimated_hours !== undefined ? { estimated_hours: estimated_hours !== null ? Number(estimated_hours) : null } : {}),
      ...(actual_hours !== undefined ? { actual_hours: actual_hours !== null ? Number(actual_hours) : null } : {}),
      ...(attachments !== undefined ? { attachments } : {}),
    };

    let updatedTask: Awaited<ReturnType<typeof prisma.taskLedger.update>>;

    // Auto-log status transitions to the activity feed
    if (status !== undefined && currentTask.status !== status) {
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { full_name: true, email: true },
      });
      const actor_name = dbUser?.full_name || dbUser?.email || "Unknown";
      const fromLabel  = STATUS_LABELS[currentTask.status] ?? currentTask.status;
      const toLabel    = STATUS_LABELS[status] ?? status;

      // Atomic: task update + activity entry in one round-trip; neither persists without the other
      [updatedTask] = await prisma.$transaction([
        prisma.taskLedger.update({ where: { task_id }, data: taskUpdateData }),
        prisma.taskActivity.create({
          data: {
            task_id,
            user_id: session.user.id,
            actor_name,
            type: "status_change",
            content: `moved this task from "${fromLabel}" to "${toLabel}"`,
            metadata: JSON.stringify({ old_status: currentTask.status, new_status: status }),
          },
        }),
      ]);

      // Audit log for status change
      writeAuditLog({
        workspace_id: currentTask.workspace_id,
        user_id: session.user.id,
        actor_name,
        actor_email: dbUser?.email,
        event_type: "task_status_change",
        entity_id: task_id,
        entity_name: updatedTask.title,
        metadata: { from: currentTask.status, to: status, from_label: fromLabel, to_label: toLabel },
      });
    } else {
      // No status change — plain update with no associated activity entry needed
      updatedTask = await prisma.taskLedger.update({ where: { task_id }, data: taskUpdateData });
    }

    // Audit log for title edit — compare against old title captured before the update
    if (title !== undefined && title !== currentTask.title) {
      const editor = await prisma.user.findUnique({ where: { id: session.user.id }, select: { full_name: true, email: true } });
      writeAuditLog({
        workspace_id: currentTask.workspace_id,
        user_id: session.user.id,
        actor_name: editor?.full_name || editor?.email || "Unknown",
        actor_email: editor?.email,
        event_type: "task_edited",
        entity_id: task_id,
        entity_name: title,
        metadata: { field: "title", old_value: currentTask.title },
      });
    }

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error("Failed to update task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/tasks?id=<task_id>
// Rules:
//   - Admins/Owners can always delete.
//   - Assignees (Member or Manager) can delete only if the task is not yet In Review/Completed/Discarded.
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
  }

  try {
    const task = await prisma.taskLedger.findUnique({
      where: { task_id: id },
      select: { workspace_id: true, assignee_id: true, status: true, title: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const globalRole = session.user.role || "Member";
    let effectiveRole = globalRole;

    if (task.workspace_id) {
      const membership = await getWorkspaceMembership(task.workspace_id, session.user.id);
      if (!membership) {
        return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
      }
      effectiveRole = resolveEffectiveRole(globalRole, membership.role);
    }

    const isAdmin    = hasMinimumRole(effectiveRole, "Admin");
    const isManager  = hasMinimumRole(effectiveRole, "Manager");
    const isAssignee = task.assignee_id === session.user.id;
    // Deletion is locked once the task enters review or a terminal state
    const isLocked   = ["In Review", "Completed", "Discarded"].includes(task.status);

    if (!isAdmin) {
      // Members cannot delete tasks at all; Managers can delete their own unlocked tasks
      if (!isManager || !isAssignee || isLocked) {
        return NextResponse.json(
          { error: "Deletion is not permitted for this task at its current status" },
          { status: 403 }
        );
      }
    }

    const deleter = await prisma.user.findUnique({ where: { id: session.user.id }, select: { full_name: true, email: true } });
    await prisma.taskLedger.delete({ where: { task_id: id } });

    writeAuditLog({
      workspace_id: task.workspace_id,
      user_id: session.user.id,
      actor_name: deleter?.full_name || deleter?.email || "Unknown",
      actor_email: deleter?.email,
      event_type: "task_deleted",
      entity_id: id,
      entity_name: task.title,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
