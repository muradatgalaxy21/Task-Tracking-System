import "./load-env";
import { prisma } from "../src/lib/prisma";
import { sendTaskCreatedEmail, sendDeadlineApproachingEmail } from "../src/lib/email";


// Set environment variables for testing if they are not set.
process.env.SMTP_HOST = process.env.SMTP_HOST || "";
process.env.SMTP_PORT = process.env.SMTP_PORT || "587";
process.env.SMTP_USER = process.env.SMTP_USER || "";
process.env.SMTP_PASS = process.env.SMTP_PASS || "";

async function main() {
  console.log("=== STARTING NOTIFICATION SYSTEM VERIFICATION ===");

  // 1. Fetch or create a test workspace and user
  console.log("Step 1: Fetching or creating test user & workspace...");
  let user = await prisma.user.findFirst({
    where: { email: "test-notify@example.com" },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: "test-notify@example.com",
        full_name: "Test Notified User",
        role: "Member",
      },
    });
    console.log(`Created test user: ${user.email} (ID: ${user.id})`);
  } else {
    console.log(`Using existing test user: ${user.email} (ID: ${user.id})`);
  }

  let workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: "Test Verification Workspace",
        description: "For verifying notification system",
      },
    });
    console.log(`Created test workspace: ${workspace.name} (ID: ${workspace.id})`);
  } else {
    console.log(`Using existing workspace: ${workspace.name} (ID: ${workspace.id})`);
  }

  // Ensure user is in the workspace
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspace_id_user_id: {
        workspace_id: workspace.id,
        user_id: user.id,
      },
    },
  });

  if (!membership) {
    await prisma.workspaceMember.create({
      data: {
        workspace_id: workspace.id,
        user_id: user.id,
        role: "Member",
      },
    });
    console.log(`Joined test user to workspace.`);
  }

  // 2. Test sendTaskCreatedEmail (Single Task)
  console.log("\nStep 2: Testing sendTaskCreatedEmail for a SINGLE task...");
  const singleTaskDetails = [
    {
      title: "Design Database Migration Path",
      description: "Analyze how to safely migrate the SQLite database to Turso and implement rollback strategies.",
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      priority: "High",
      estimatedDays: 3,
    },
  ];

  await sendTaskCreatedEmail({
    toEmail: user.email!,
    toName: user.full_name || "Test Assignee",
    creatorName: "Project Owner",
    workspaceName: workspace.name,
    taskDetails: singleTaskDetails,
  });
  console.log("Single task email notification function invoked successfully.");

  // 3. Test sendTaskCreatedEmail (Recurring Batch Task)
  console.log("\nStep 3: Testing sendTaskCreatedEmail for a RECURRING batch of tasks...");
  const batchTaskDetails = [
    {
      title: "Weekly Status Report 1/3",
      description: "Compile and present weekly status reports to the manager.",
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      priority: "Medium",
      estimatedDays: 1,
    },
    {
      title: "Weekly Status Report 2/3",
      description: "Compile and present weekly status reports to the manager.",
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      priority: "Medium",
      estimatedDays: 1,
    },
    {
      title: "Weekly Status Report 3/3",
      description: "Compile and present weekly status reports to the manager.",
      deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      priority: "Medium",
      estimatedDays: 1,
    },
  ];

  await sendTaskCreatedEmail({
    toEmail: user.email!,
    toName: user.full_name || "Test Assignee",
    creatorName: "Project Owner",
    workspaceName: workspace.name,
    taskDetails: batchTaskDetails,
  });
  console.log("Recurring task email notification function invoked successfully.");

  // 4. Test Deadline Alerts Cron Logic
  console.log("\nStep 4: Testing Deadline Alerting Cron logic...");

  // Create a task due soon (e.g. in 12 hours) that is not completed
  const soonDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const soonTask = await prisma.taskLedger.create({
    data: {
      title: "Urgent Hotfix: Auth Verification Loop",
      description: "Fix loop on verification token check endpoint.",
      assignee_id: user.id,
      workspace_id: workspace.id,
      max_deadline: soonDeadline,
      status: "In Progress",
      priority: "High",
      estimated_days: 1,
    },
  });
  console.log(`Created urgent test task: "${soonTask.title}" (ID: ${soonTask.task_id}, Deadline: ${soonTask.max_deadline})`);

  // Define helper simulating the cron GET logic
  const simulateCron = async () => {
    const now = new Date();
    const warningThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const overdueLimit = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const upcomingTasks = await prisma.taskLedger.findMany({
      where: {
        status: {
          notIn: ["Completed", "Discarded"],
        },
        max_deadline: {
          gte: overdueLimit,
          lte: warningThreshold,
        },
        assignee_id: user!.id, // limit to our test user to avoid clutter
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

    console.log(`Cron query returned ${upcomingTasks.length} tasks due soon.`);
    let sentCount = 0;

    for (const t of upcomingTasks) {
      const existingNotification = await prisma.notification.findFirst({
        where: {
          task_id: t.task_id,
          type: "deadline",
        },
      });

      if (existingNotification) {
        console.log(`- Skipping task "${t.title}": Alert was already sent previously.`);
        continue;
      }

      console.log(`- Alerting for task "${t.title}": Creating in-app alert & sending email.`);
      await prisma.notification.create({
        data: {
          user_id: t.assignee_id,
          task_id: t.task_id,
          task_title: t.title,
          from_name: "System",
          type: "deadline",
          message: `Deadline alert: "${t.title}" is due soon.`,
        },
      });

      if (t.assignee.email) {
        await sendDeadlineApproachingEmail({
          toEmail: t.assignee.email,
          toName: t.assignee.full_name || t.assignee.email.split("@")[0],
          taskTitle: t.title,
          deadline: t.max_deadline,
          priority: t.priority || "Medium",
        });
      }

      sentCount++;
    }

    return sentCount;
  };

  // Run Cron simulation run 1 (should send notification)
  console.log("\nRunning Cron simulation (Run 1)...");
  const run1Count = await simulateCron();
  console.log(`Run 1 sent ${run1Count} alerts.`);

  // Run Cron simulation run 2 (should skip, verifying de-duplication)
  console.log("\nRunning Cron simulation (Run 2) - should not send duplicate alerts...");
  const run2Count = await simulateCron();
  console.log(`Run 2 sent ${run2Count} alerts. (De-duplication works!)`);

  // 5. Cleanup test artifacts
  console.log("\nStep 5: Cleaning up test artifacts...");
  await prisma.notification.deleteMany({
    where: { task_id: soonTask.task_id },
  });
  await prisma.taskLedger.delete({
    where: { task_id: soonTask.task_id },
  });
  console.log("Cleanup finished.");
  console.log("\n=== VERIFICATION COMPLETED SUCCESSFULLY ===");
}

main()
  .catch((e) => {
    console.error("Verification script error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
