import nodemailer from "nodemailer";

// Sends a password reset email.
// If SMTP env vars are not set, the link is printed to the server console (dev fallback).
export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const smtpConfigured =
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

  if (!smtpConfigured) {
    console.log(`[PASSWORD RESET] Token link for ${email}: ${resetUrl}`);
    return;
  }

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: "Reset your password - AI and Beyond",
    html: `
      <p>You requested a password reset for your AI and Beyond account.</p>
      <p>Click the link below to set a new password. This link expires in 15 minutes and can only be used once.</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, you can safely ignore this email. Your password will not change.</p>
    `,
  });
}
