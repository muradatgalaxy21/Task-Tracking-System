// Shared email helpers — server-only. Never import from client components.

import { getResend, buildFrom, buildProfilesFrom, isEmailConfigured } from "@/lib/resend";

// Sends an email to a user who was @mentioned in a task comment.
// Logs and swallows errors so a Resend outage never blocks the comment from saving.
export async function sendMentionEmail({
  toEmail,
  toName,
  fromName,
  taskTitle,
  commentPreview,
}: {
  toEmail: string;
  toName: string;
  fromName: string;
  taskTitle: string;
  commentPreview: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!isEmailConfigured()) {
    console.log(`[MENTION] ${fromName} mentioned ${toEmail} in "${taskTitle}"`);
    return;
  }

  try {
    const { error } = await getResend().emails.send({
      from: buildFrom("AI & Beyond"),
      to: toEmail,
      subject: `${fromName} mentioned you in "${taskTitle}"`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #fafaf9; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e7e5e4; overflow: hidden;">
    <div style="background: #e06b6b; padding: 20px 28px;">
      <p style="color: white; font-size: 13px; font-weight: 700; letter-spacing: 1px; margin: 0; text-transform: uppercase;">AI & Beyond</p>
    </div>
    <div style="padding: 28px;">
      <p style="font-size: 15px; color: #57534e; margin: 0 0 12px;">Hi ${toName},</p>
      <p style="font-size: 15px; color: #292524; margin: 0 0 20px;">
        <strong>${fromName}</strong> mentioned you in a comment on task <strong>${taskTitle}</strong>.
      </p>
      <div style="background: #fafaf9; border: 1px solid #e7e5e4; border-left: 3px solid #e06b6b; border-radius: 6px; padding: 14px 16px; margin-bottom: 24px;">
        <p style="font-size: 13px; color: #78716c; margin: 0; font-style: italic; line-height: 1.5;">"${commentPreview}"</p>
      </div>
      <a href="${appUrl}/dashboard"
         style="display: inline-block; padding: 11px 22px; background: #e06b6b; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Open Dashboard
      </a>
    </div>
    <div style="padding: 14px 28px; border-top: 1px solid #e7e5e4;">
      <p style="font-size: 11px; color: #a8a29e; margin: 0;">AI & Beyond internal platform — automated notification</p>
    </div>
  </div>
</body>
</html>
      `,
    });
    if (error) {
      console.error("sendMentionEmail failed:", error);
    }
  } catch (err) {
    console.error("sendMentionEmail failed:", err);
  }
}

// Sends a re-verification email when an Admin or Owner modifies their profile.
// If Resend is not configured, prints the link to the server console as a dev fallback.
export async function sendProfileVerificationEmail({
  toEmail,
  toName,
  verifyUrl,
}: {
  toEmail: string;
  toName: string;
  verifyUrl: string;
}) {
  if (!isEmailConfigured()) {
    console.log(`[PROFILE VERIFY] Link for ${toEmail}: ${verifyUrl}`);
    return;
  }

  try {
    const { error } = await getResend().emails.send({
      from: buildFrom("AI & Beyond"),
      to: toEmail,
      subject: "Confirm your profile update — AI and Beyond",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #fafaf9; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e7e5e4; overflow: hidden;">
    <div style="background: #7b2c51; padding: 20px 28px;">
      <p style="color: white; font-size: 13px; font-weight: 700; letter-spacing: 1px; margin: 0; text-transform: uppercase;">AI & Beyond</p>
    </div>
    <div style="padding: 28px;">
      <p style="font-size: 15px; color: #57534e; margin: 0 0 12px;">Hi ${toName},</p>
      <p style="font-size: 15px; color: #292524; margin: 0 0 20px;">
        A profile update has been requested for your account. Because your account has elevated privileges,
        we need to verify this change before applying it.
      </p>
      <p style="font-size: 13px; color: #78716c; margin: 0 0 24px;">
        Click the button below to confirm and apply your profile changes. This link expires in 30 minutes and can only be used once.
      </p>
      <a href="${verifyUrl}"
         style="display: inline-block; padding: 11px 22px; background: #7b2c51; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Confirm Profile Update
      </a>
      <p style="font-size: 11px; color: #a8a29e; margin: 24px 0 0;">
        If you did not request this change, ignore this email. No changes will be made.
      </p>
    </div>
    <div style="padding: 14px 28px; border-top: 1px solid #e7e5e4;">
      <p style="font-size: 11px; color: #a8a29e; margin: 0;">AI & Beyond internal platform — automated security notification</p>
    </div>
  </div>
</body>
</html>
      `,
    });
    if (error) {
      console.error("sendProfileVerificationEmail failed:", error);
    }
  } catch (err) {
    console.error("sendProfileVerificationEmail failed:", err);
  }
}

// Sends an account deletion verification email.
// If Resend is not configured, prints the link to the server console as a dev fallback.
export async function sendAccountDeletionVerificationEmail({
  toEmail,
  toName,
  verifyUrl,
}: {
  toEmail: string;
  toName: string;
  verifyUrl: string;
}) {
  if (!isEmailConfigured()) {
    console.log(`[ACCOUNT DELETION] Verification link for ${toEmail}: ${verifyUrl}`);
    return;
  }

  try {
    const { error } = await getResend().emails.send({
      from: buildFrom("AI & Beyond Security"),
      to: toEmail,
      subject: "Confirm your account deletion — AI and Beyond",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #fafaf9; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e7e5e4; overflow: hidden;">
    <div style="background: #991b1b; padding: 20px 28px;">
      <p style="color: white; font-size: 13px; font-weight: 700; letter-spacing: 1px; margin: 0; text-transform: uppercase;">AI & Beyond</p>
    </div>
    <div style="padding: 28px;">
      <p style="font-size: 15px; color: #57534e; margin: 0 0 12px;">Hi ${toName},</p>
      <p style="font-size: 15px; color: #292524; margin: 0 0 20px;">
        We received a request to permanently delete your AI & Beyond account. This will permanently delete your profile, and clean up or transfer workspaces you own.
      </p>
      <p style="font-size: 13px; color: #78716c; margin: 0 0 24px;">
        Click the button below to confirm the permanent deletion of your account. This link expires in 30 minutes and can only be used once.
      </p>
      <a href="${verifyUrl}"
         style="display: inline-block; padding: 11px 22px; background: #991b1b; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Delete My Account
      </a>
      <p style="font-size: 11px; color: #a8a29e; margin: 24px 0 0;">
        If you did not request this deletion, you can ignore this email. No changes will be made.
      </p>
    </div>
    <div style="padding: 14px 28px; border-top: 1px solid #e7e5e4;">
      <p style="font-size: 11px; color: #a8a29e; margin: 0;">AI & Beyond internal platform — automated security notification</p>
    </div>
  </div>
</body>
</html>
      `,
    });
    if (error) {
      console.error("sendAccountDeletionVerificationEmail failed:", error);
    }
  } catch (err) {
    console.error("sendAccountDeletionVerificationEmail failed:", err);
  }
}

// Sends an email notification to the assignee when a task (or recurring task batch) is created.
// Wrap the entire email dispatch process inside try-catch block for robust error handling.
export async function sendTaskCreatedEmail({
  toEmail,
  toName,
  creatorName,
  workspaceName,
  taskDetails,
}: {
  toEmail: string;
  toName: string;
  creatorName: string;
  workspaceName: string;
  taskDetails: {
    title: string;
    description?: string;
    deadline: Date;
    priority?: string;
    estimatedDays?: number;
  }[];
}) {
  // 1. Verify Resend is configured. If not, log fallback details to the server console.
  if (!isEmailConfigured()) {
    console.log(`[TASK CREATED] Mock email to ${toEmail} (${toName}):`);
    console.log(`Creator: ${creatorName}, Workspace: ${workspaceName}`);
    console.log("Tasks created:", JSON.stringify(taskDetails, null, 2));
    return;
  }

  try {
    const isBatch = taskDetails.length > 1;
    const subject = isBatch
      ? `New Recurring Tasks Assigned: ${taskDetails[0].title.replace(/ 1\/\d+$/, "")} (${taskDetails.length} occurrences)`
      : `New Task Assigned: ${taskDetails[0].title}`;

    // 2. Build the task list items markup using HSL gradients and modern typography rules.
    const taskItemsHtml = taskDetails
      .map((t) => {
        const priorityColor =
          t.priority === "High"
            ? "#ef4444"
            : t.priority === "Medium"
            ? "#f59e0b"
            : "#10b981";
        return `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
          <h3 style="color: #0f172a; margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${t.title}</h3>
          ${t.description ? `<p style="color: #64748b; font-size: 14px; margin: 0 0 12px 0; line-height: 1.5;">${t.description}</p>` : ""}
          <div style="display: flex; gap: 12px; font-size: 12px; color: #475569; flex-wrap: wrap;">
            <span style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 6px;">
              <strong>Deadline:</strong> ${new Date(t.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 6px;">
              <strong>Priority:</strong> <span style="color: ${priorityColor}; font-weight: 600;">${t.priority || "Medium"}</span>
            </span>
            ${t.estimatedDays ? `
            <span style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 6px;">
              <strong>Est. Days:</strong> ${t.estimatedDays}
            </span>` : ""}
          </div>
        </div>
      `;
      })
      .join("");

    // 3. Send the generated HTML email message body via the shared Resend client.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const { error } = await getResend().emails.send({
      from: buildFrom("AI & Beyond Planner"),
      to: toEmail,
      subject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #fafaf9; margin: 0; padding: 40px 20px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e7e5e4; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 28px; text-align: center;">
      <p style="color: rgba(255,255,255,0.85); font-size: 12px; font-weight: 700; letter-spacing: 1.5px; margin: 0 0 6px 0; text-transform: uppercase;">AI & Beyond Workspace</p>
      <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Task Assignment Notification</h1>
    </div>
    <div style="padding: 28px; background: #fafaf9;">
      <p style="font-size: 15px; color: #475569; margin: 0 0 16px 0;">Hi ${toName},</p>
      <p style="font-size: 15px; color: #1e293b; margin: 0 0 24px 0; line-height: 1.6;">
        <strong>${creatorName}</strong> has assigned new task activity to you in the <strong>${workspaceName}</strong> workspace:
      </p>

      ${taskItemsHtml}

      <div style="text-align: center; margin-top: 32px; margin-bottom: 12px;">
        <a href="${appUrl}/dashboard"
           style="display: inline-block; padding: 13px 28px; background: #4f46e5; color: white !important; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.15);">
          Open Task Dashboard
        </a>
      </div>
    </div>
    <div style="padding: 16px 28px; border-top: 1px solid #e7e5e4; background: #ffffff; text-align: center;">
      <p style="font-size: 11px; color: #94a3b8; margin: 0;">This is an automated task manager alert. Please do not reply directly.</p>
    </div>
  </div>
</body>
</html>
      `,
    });
    if (error) {
      // 4. Log detailed Resend errors to the console instead of throwing up so execution doesn't halt.
      console.error("sendTaskCreatedEmail failed:", error);
    }
  } catch (err) {
    console.error("sendTaskCreatedEmail failed:", err);
  }
}

// Sends an email notification to alert the user of an approaching task deadline.
// Uses try-catch blocks to catch and log any communication errors gracefully.
export async function sendDeadlineApproachingEmail({
  toEmail,
  toName,
  taskTitle,
  deadline,
  priority,
}: {
  toEmail: string;
  toName: string;
  taskTitle: string;
  deadline: Date;
  priority?: string;
}) {
  // 1. Verify Resend is configured. If not, log a fallback warning to the server console.
  if (!isEmailConfigured()) {
    console.log(`[DEADLINE ALERT MOCK] Task: "${taskTitle}" is due soon for ${toEmail}`);
    return;
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const priorityColor =
      priority === "High"
        ? "#ef4444"
        : priority === "Medium"
        ? "#f59e0b"
        : "#10b981";

    // 2. Dispatch the warning alert email to the assignee about the imminent deadline.
    const { error } = await getResend().emails.send({
      from: buildFrom("AI & Beyond Coordinator"),
      to: toEmail,
      subject: `Urgent: Deadline Approaching for "${taskTitle}"`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #fafaf9; margin: 0; padding: 40px 20px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e7e5e4; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #e11d48, #ea580c); padding: 28px; text-align: center;">
      <p style="color: rgba(255,255,255,0.85); font-size: 12px; font-weight: 700; letter-spacing: 1.5px; margin: 0 0 6px 0; text-transform: uppercase;">Deadline Warning Alert</p>
      <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Task Approaching Deadline</h1>
    </div>
    <div style="padding: 28px; background: #fafaf9;">
      <p style="font-size: 15px; color: #475569; margin: 0 0 16px 0;">Hi ${toName},</p>
      <p style="font-size: 15px; color: #1e293b; margin: 0 0 20px 0; line-height: 1.6;">
        The deadline for your assigned task <strong>"${taskTitle}"</strong> is approaching quickly. Please review the details below:
      </p>

      <div style="background: #ffffff; border: 1px solid #fca5a5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <h3 style="color: #0f172a; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">${taskTitle}</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Deadline:</td>
            <td style="padding: 6px 0; color: #e11d48; font-weight: 600;">
              ${new Date(deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Priority:</td>
            <td style="padding: 6px 0; color: ${priorityColor}; font-weight: 600;">${priority || "Medium"}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 14px; color: #475569; margin: 0 0 24px 0; line-height: 1.5;">
        Please complete the requirements and submit the task for evaluation or request an extension if required. Maintaining timely task completion is critical for your Task Performance Score (TPS).
      </p>

      <div style="text-align: center; margin-bottom: 12px;">
        <a href="${appUrl}/dashboard"
           style="display: inline-block; padding: 13px 28px; background: #e11d48; color: white !important; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 6px rgba(225, 29, 72, 0.15);">
          Open Task Dashboard
        </a>
      </div>
    </div>
    <div style="padding: 16px 28px; border-top: 1px solid #e7e5e4; background: #ffffff; text-align: center;">
      <p style="font-size: 11px; color: #94a3b8; margin: 0;">This is an automated time-sensitive system notification.</p>
    </div>
  </div>
</body>
</html>
      `,
    });
    if (error) {
      // 3. Handle errors and log descriptions of failures cleanly without throwing.
      console.error("sendDeadlineApproachingEmail failed:", error);
    }
  } catch (err) {
    console.error("sendDeadlineApproachingEmail failed:", err);
  }
}

// Sends a verification email to the NEW email address when a user requests an
// email change. The verification link must be clicked to apply the update.
// Uses the dedicated profiles@ sender address.
export async function sendEmailChangeVerificationEmail({
  toEmail,
  toName,
  newEmail,
  verifyUrl,
}: {
  toEmail: string;
  toName: string;
  newEmail: string;
  verifyUrl: string;
}): Promise<void> {
  // 1. Check if Resend is configured. If not, log the verification link for local dev.
  if (!isEmailConfigured()) {
    console.log(`[EMAIL CHANGE] Verification link for ${newEmail}: ${verifyUrl}`);
    return;
  }

  try {
    // 2. Send the verification email to the new address via the profiles sender.
    const { error } = await getResend().emails.send({
      from: buildProfilesFrom("AI & Beyond Profiles"),
      to: newEmail,
      subject: "Verify your new email address — AI and Beyond",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #fafaf9; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e7e5e4; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #7b2c51, #5a1d3b); padding: 20px 28px;">
      <p style="color: white; font-size: 13px; font-weight: 700; letter-spacing: 1px; margin: 0; text-transform: uppercase;">AI & Beyond</p>
    </div>
    <div style="padding: 28px;">
      <p style="font-size: 15px; color: #57534e; margin: 0 0 12px;">Hi ${toName},</p>
      <p style="font-size: 15px; color: #292524; margin: 0 0 20px;">
        A request was made to change your account email to <strong>${newEmail}</strong>.
        Please verify this new email address by clicking the button below.
      </p>
      <p style="font-size: 13px; color: #78716c; margin: 0 0 24px;">
        This link expires in 30 minutes and can only be used once. If you did not request this change, ignore this email.
      </p>
      <a href="${verifyUrl}"
         style="display: inline-block; padding: 11px 22px; background: #7b2c51; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Verify New Email
      </a>
      <p style="font-size: 11px; color: #a8a29e; margin: 24px 0 0;">
        If you did not request this change, you can safely ignore this email. Your current email will remain unchanged.
      </p>
    </div>
    <div style="padding: 14px 28px; border-top: 1px solid #e7e5e4;">
      <p style="font-size: 11px; color: #a8a29e; margin: 0;">AI & Beyond internal platform — automated security notification</p>
    </div>
  </div>
</body>
</html>
      `,
    });
    if (error) {
      // 3. Log Resend errors without throwing so the API route can still respond.
      console.error("sendEmailChangeVerificationEmail failed:", error);
    }
  } catch (err) {
    console.error("sendEmailChangeVerificationEmail failed:", err);
  }
}
