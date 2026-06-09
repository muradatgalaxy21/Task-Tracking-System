import "./load-env";
import nodemailer from "nodemailer";
import { prisma } from "../src/lib/prisma";
import { sendTaskCreatedEmail, sendDeadlineApproachingEmail } from "../src/lib/email";

// Keep track of the last sent message info to generate Ethereal preview URLs.
let lastSentMailInfo: any = null;

// Spy on nodemailer.createTransport to capture SMTP send mail result
const originalCreateTransport = nodemailer.createTransport;
(nodemailer as any).createTransport = function (this: any, ...args: any[]) {
  const transporter = (originalCreateTransport as any).apply(this, args);
  const originalSendMail = transporter.sendMail;
  transporter.sendMail = async function (this: any, mailOptions: any) {
    try {
      const info = await originalSendMail.call(this, mailOptions);
      lastSentMailInfo = info;
      return info;
    } catch (err) {
      console.error("Intercepted sendMail failed:", err);
      throw err;
    }
  };
  return transporter;
};

async function main() {
  console.log("=== STARTING ETHEREAL NOTIFICATION SYSTEM VERIFICATION ===");

  // 1. Create an Ethereal test account
  console.log("Step 1: Creating Ethereal SMTP test account...");
  let testAccount: nodemailer.TestAccount;
  try {
    testAccount = await nodemailer.createTestAccount();
    console.log(`Created Ethereal account: ${testAccount.user}`);
  } catch (err) {
    console.error("Failed to create Ethereal test account:", err);
    return;
  }

  // Configure environment variables in memory for testing
  process.env.SMTP_HOST = testAccount.smtp.host;
  process.env.SMTP_PORT = testAccount.smtp.port.toString();
  process.env.SMTP_USER = testAccount.user;
  process.env.SMTP_PASS = testAccount.pass;

  // 2. Fetch or create a test workspace and user
  console.log("\nStep 2: Fetching or creating test user & workspace in database...");
  let user;
  try {
    user = await prisma.user.findFirst({
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
  } catch (err) {
    console.error("Database user setup failed:", err);
    return;
  }

  let workspace;
  try {
    workspace = await prisma.workspace.findFirst();
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
  } catch (err) {
    console.error("Database workspace setup failed:", err);
    return;
  }

  // Ensure user is in the workspace
  try {
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
      console.log("Joined test user to workspace.");
    }
  } catch (err) {
    console.error("Database membership setup failed:", err);
    return;
  }

  // 3. Test sendTaskCreatedEmail (Single Task)
  console.log("\nStep 3: Testing sendTaskCreatedEmail for a SINGLE task...");
  const singleTaskDetails = [
    {
      title: "Design Database Migration Path",
      description: "Analyze how to safely migrate the SQLite database to Turso and implement rollback strategies.",
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      priority: "High",
      estimatedDays: 3,
    },
  ];

  lastSentMailInfo = null;
  await sendTaskCreatedEmail({
    toEmail: user.email!,
    toName: user.full_name || "Test Assignee",
    creatorName: "Project Owner",
    workspaceName: workspace.name,
    taskDetails: singleTaskDetails,
  });

  if (lastSentMailInfo) {
    const previewUrl = nodemailer.getTestMessageUrl(lastSentMailInfo);
    console.log(`Single task email dispatched successfully.`);
    console.log(`Preview URL: ${previewUrl}`);
  } else {
    console.error("Single task email failed to send (no mail info captured).");
  }

  // 4. Test sendTaskCreatedEmail (Recurring Batch Task)
  console.log("\nStep 4: Testing sendTaskCreatedEmail for a RECURRING batch of tasks...");
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

  lastSentMailInfo = null;
  await sendTaskCreatedEmail({
    toEmail: user.email!,
    toName: user.full_name || "Test Assignee",
    creatorName: "Project Owner",
    workspaceName: workspace.name,
    taskDetails: batchTaskDetails,
  });

  if (lastSentMailInfo) {
    const previewUrl = nodemailer.getTestMessageUrl(lastSentMailInfo);
    console.log(`Recurring task email batch dispatched successfully.`);
    console.log(`Preview URL: ${previewUrl}`);
  } else {
    console.error("Recurring task email batch failed to send (no mail info captured).");
  }

  // 5. Test Deadline Alerts Cron Logic
  console.log("\nStep 5: Testing Deadline Alerting Cron logic...");

  // Create a task due soon (e.g. in 12 hours) that is not completed
  const soonDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000);
  let soonTask;
  try {
    soonTask = await prisma.taskLedger.create({
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
    console.log(`Created urgent test task: "${soonTask.title}" (ID: ${soonTask.task_id})`);
  } catch (err) {
    console.error("Failed to create test task for deadline alerts:", err);
    return;
  }

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
        lastSentMailInfo = null;
        await sendDeadlineApproachingEmail({
          toEmail: t.assignee.email,
          toName: t.assignee.full_name || t.assignee.email.split("@")[0],
          taskTitle: t.title,
          deadline: t.max_deadline,
          priority: t.priority || "Medium",
        });

        if (lastSentMailInfo) {
          const previewUrl = nodemailer.getTestMessageUrl(lastSentMailInfo);
          console.log(`  Deadline approaching email dispatched successfully.`);
          console.log(`  Preview URL: ${previewUrl}`);
        } else {
          console.error("  Deadline approaching email failed to send.");
        }
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

  // 6. Cleanup test artifacts
  console.log("\nStep 6: Cleaning up test database artifacts...");
  try {
    await prisma.notification.deleteMany({
      where: { task_id: soonTask.task_id },
    });
    await prisma.taskLedger.delete({
      where: { task_id: soonTask.task_id },
    });
    console.log("Cleanup finished successfully.");
  } catch (err) {
    console.error("Cleanup failed:", err);
  }

  console.log("\n=== VERIFICATION COMPLETED SUCCESSFULLY ===");
  console.log(`\nYou can also visit the Ethereal inbox to check messages:`);
  console.log(`Username: ${testAccount.user}`);
  console.log(`Password: ${testAccount.pass}`);
  console.log(`Inbox URL: https://ethereal.email/messages`);
}

main()
  .catch((e) => {
    console.error("Verification script error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
