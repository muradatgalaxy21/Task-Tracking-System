import { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GithubProvider from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getCachedAuthState } from "@/lib/role-cache";
import { getResend, buildFrom, isEmailConfigured } from "@/lib/resend";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    EmailProvider({
      from: buildFrom("AI & Beyond"),
      // Sends the magic-link sign-in email via the shared Resend client instead of an
      // SMTP transporter, removing the socket-timeout failures that broke this flow
      // in serverless. Falls back to logging the link when Resend is not configured.
      sendVerificationRequest: async ({ identifier, url }) => {
        if (!isEmailConfigured()) {
          console.log(`[MAGIC LINK] Sign-in link for ${identifier}: ${url}`);
          return;
        }

        const { error } = await getResend().emails.send({
          from: buildFrom("AI & Beyond"),
          to: identifier,
          subject: "Sign in to AI and Beyond",
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #fafaf9; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e7e5e4; overflow: hidden;">
    <div style="background: #4f46e5; padding: 20px 28px;">
      <p style="color: white; font-size: 13px; font-weight: 700; letter-spacing: 1px; margin: 0; text-transform: uppercase;">AI & Beyond</p>
    </div>
    <div style="padding: 28px;">
      <p style="font-size: 15px; color: #292524; margin: 0 0 20px;">
        Click the button below to sign in to AI and Beyond. This link expires shortly and can only be used once.
      </p>
      <a href="${url}"
         style="display: inline-block; padding: 11px 22px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Sign in
      </a>
      <p style="font-size: 11px; color: #a8a29e; margin: 24px 0 0;">
        If you did not request this email, you can safely ignore it.
      </p>
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
          throw new Error(`Resend failed to send magic link: ${error.message}`);
        }
      },
    }),

    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        // Normalize to match how emails are stored at signup — otherwise a
        // different-cased login would fail to find an existing account.
        const normalizedEmail = credentials.email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (!user || !user.password) {
          throw new Error("Invalid credentials");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error("Invalid credentials");
        }

        // Return only the fields NextAuth needs — never let the password hash
        // flow into the user object that seeds the JWT.
        return {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
        };
      },
    }),

    // Google OAuth - only registered when credentials are present in env
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    // GitHub OAuth - only registered when credentials are present in env
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GithubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
          }),
        ]
      : []),
  ],

  session: {
    strategy: "jwt",
  },

  events: {
    async signIn({ user, isNewUser }) {
      const eventType = isNewUser ? "user_signup" : "user_login";
      writeAuditLog({
        workspace_id: null,
        user_id: user.id,
        actor_name: (user as { full_name?: string | null }).full_name || user.email || "Unknown",
        actor_email: user.email,
        event_type: eventType,
        entity_id: user.id,
        entity_name: (user as { full_name?: string | null }).full_name || user.email || "Unknown",
      });
    },
  },

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.sub = user.id;
        // Fetch full_name on initial sign-in since the user object may not include it
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { full_name: true },
        });
        token.full_name = dbUser?.full_name ?? null;
      }

      // Sync token when the client calls update() (e.g. after onboarding)
      if (trigger === "update" && session?.full_name !== undefined) {
        token.full_name = session.full_name;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        // @ts-expect-error: NextAuth session user does not have custom ID field by default
        session.user.id = token.sub;
        session.user.full_name = token.full_name;

        // Fetch role + last password-change time through a short-TTL cache to
        // avoid a DB round trip on every page load, while still picking up role
        // changes and password resets within seconds (see invalidateRoleCache
        // in admin/users/[id]/route.ts for the immediate-update path).
        const authState = await getCachedAuthState(token.sub!);

        // Reject sessions whose JWT was issued before the user's password was
        // last changed — a reset invalidates every previously-issued token.
        // Compare at second granularity (token.iat is seconds) so a login in the
        // same second as the reset is not spuriously rejected.
        const issuedAtSec = typeof token.iat === "number" ? token.iat : 0;
        const changedAtSec =
          authState?.passwordChangedAt !== null && authState?.passwordChangedAt !== undefined
            ? Math.floor(authState.passwordChangedAt / 1000)
            : null;
        if (!authState || (changedAtSec !== null && issuedAtSec < changedAtSec)) {
          // Strip identity so downstream requireAuth/requireRole treat this as
          // unauthenticated, forcing a fresh sign-in.
          // @ts-expect-error: clearing the custom id field
          session.user.id = undefined;
          return session;
        }

        session.user.role = authState.role;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },

  debug: false,
};
