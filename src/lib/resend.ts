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

// Construct the client lazily, not at module load. The Resend SDK throws
// "Missing API key" in its constructor when RESEND_API_KEY is unset, and Next.js
// imports every route module during the build's page-data collection — eager
// construction would crash the build whenever the key is absent. Callers always
// gate sends behind isEmailConfigured(), so this only runs when the key exists.
export function getResend(): Resend {
  if (!globalForResend.resend) {
    globalForResend.resend = new Resend(process.env.RESEND_API_KEY);
  }
  return globalForResend.resend;
}

// Verified sending domain/address, e.g. "notifications@yourdomain.com".
// Falls back to Resend's shared sandbox address so local dev works without
// a verified domain (sandbox mail only delivers to the account owner).
const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM || "tasks@aiandbeyondsolutions.site";

// Dedicated profiles sender address for account-related emails
// (email change verification, profile updates). Uses a separate env var
// so the sending identity can differ from transactional notifications.
const PROFILES_EMAIL_FROM_ADDRESS =
  process.env.PROFILES_EMAIL_FROM || "profiles@aiandbeyondsolutions.online";

// Builds a "Display Name <address>" From header, reusing the configured
// sending address with a per-email-type display name.
export function buildFrom(displayName: string): string {
  return `${displayName} <${EMAIL_FROM_ADDRESS}>`;
}

// Builds a "Display Name <address>" From header using the profiles address.
// Used for account-related emails such as email change verification.
export function buildProfilesFrom(displayName: string): string {
  return `${displayName} <${PROFILES_EMAIL_FROM_ADDRESS}>`;
}

// True when RESEND_API_KEY is set. Senders fall back to logging the email
// content/link to the console when this is false, so local dev and CI work
// without a Resend account.
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
