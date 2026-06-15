// Shared Resend client — server-only. Never import from client components.
//
// Replaces the previous per-function nodemailer SMTP transporters in
// src/lib/email.ts and src/lib/mailer.ts. SMTP sockets were prone to long
// connect/handshake timeouts on serverless invocations; Resend's HTTPS API
// returns quickly and never holds a function open waiting on a TCP handshake.

import { Resend } from "resend";

// globalThis persists across Next.js hot-reloads in dev and across
// invocations on a warm serverless instance, mirroring the Prisma singleton
// in src/lib/prisma.ts.
const globalForResend = global as unknown as { resend?: Resend };

export const resend = globalForResend.resend ?? new Resend(process.env.RESEND_API_KEY);
globalForResend.resend = resend;

// Verified sending domain/address, e.g. "notifications@yourdomain.com".
// Falls back to Resend's shared sandbox address so local dev works without
// a verified domain (sandbox mail only delivers to the account owner).
const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM || "onboarding@resend.dev";

// Builds a "Display Name <address>" From header, reusing the configured
// sending address with a per-email-type display name.
export function buildFrom(displayName: string): string {
  return `${displayName} <${EMAIL_FROM_ADDRESS}>`;
}

// True when RESEND_API_KEY is set. Senders fall back to logging the email
// content/link to the console when this is false, so local dev and CI work
// without a Resend account.
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
