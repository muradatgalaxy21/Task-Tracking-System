import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDeadlineApproachingEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// GET /api/cron/deadline-alerts
// Scans for active tasks due within 24 hours and dispatches email/in-app reminders.
// Wrap execution in standard try-catch blocks to handle potential database or SMTP connection failures.
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Verify CRON security token if configured in the environment variables.
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get("Authorization");
      const { searchParams } = new URL(req.url);
      const querySecret = searchParams.get("secret");

      const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
      const isQueryValid = querySecret === cronSecret;

      if (!isHeaderValid && !isQueryValid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const now = new Date();
    const warningThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
    const overdueLimit = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    // 2. Fetch all active tasks (not Completed or Discarded) with deadlines falling in the warning window.
    const upcomingTasks = await prisma.taskLedger.findMany({
      where: {
        status: {
          notIn: ["Completed", "Discarded"],
        },
        max_deadline: {
          gte: overdueLimit,
          lte: warningThreshold,
        },
      },
      include: {
        assignee: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
    });

    let alertsSent = 0;
    const failures: { taskId: string; error: string }[] = [];

    // 3. Process each task individually so that a single user's email/notification error does not crash the entire batch.
    for (const task of upcomingTasks) {
      try {
        // 4. Query the Notification table to check if a deadline alert has already been generated to avoid duplicate spam.
        const existingNotification = await prisma.notification.findFirst({
          where: {
            task_id: task.task_id,
            type: "deadline",
          },
        });

        if (existingNotification) {
          continue; // Notification already sent, skip.
        }

        // 5. Create in-app notification row and dispatch email alert concurrently.
        await prisma.notification.create({
          data: {
            user_id: task.assignee_id,
            task_id: task.task_id,
            task_title: task.title,
            from_name: "System",
            type: "deadline",
            message: `Deadline alert: "${task.title}" is due soon.`,
          },
        });

        if (task.assignee.email) {
          await sendDeadlineApproachingEmail({
            toEmail: task.assignee.email,
            toName: task.assignee.full_name || task.assignee.email.split("@")[0],
            taskTitle: task.title,
            deadline: task.max_deadline,
            priority: task.priority || "Medium",
          });
        }

        alertsSent++;
      } catch (taskErr: any) {
        console.error(`Failed to process deadline alert for task ${task.task_id}:`, taskErr);
        failures.push({
          taskId: task.task_id,
          error: taskErr?.message || String(taskErr),
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: upcomingTasks.length,
      alertsSent,
      failures,
    });
  } catch (error) {
    console.error("Deadline alerts cron job failed:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
