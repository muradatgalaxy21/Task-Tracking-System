// Shared email helpers — server-only. Never import from client components.

import nodemailer from "nodemailer";

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// Sends an email to a user who was @mentioned in a task comment.
// Logs and swallows errors so a broken SMTP config never blocks the comment from saving.
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

  try {
    const transporter = createTransporter();

    await transporter.sendMail({
      from: `"AI & Beyond" <${process.env.SMTP_USER}>`,
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
  } catch (err) {
    console.error("sendMentionEmail failed:", err);
  }
}

// Sends a re-verification email when an Admin or Owner modifies their profile.
// If SMTP is not configured, prints the link to the server console as a dev fallback.
export async function sendProfileVerificationEmail({
  toEmail,
  toName,
  verifyUrl,
}: {
  toEmail: string;
  toName: string;
  verifyUrl: string;
}) {
  const smtpConfigured =
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

  if (!smtpConfigured) {
    console.log(`[PROFILE VERIFY] Link for ${toEmail}: ${verifyUrl}`);
    return;
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"AI & Beyond" <${process.env.SMTP_USER}>`,
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
  } catch (err) {
    console.error("sendProfileVerificationEmail failed:", err);
  }
}
