import { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GithubProvider from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    EmailProvider({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        },
      },
      from: process.env.SMTP_USER,
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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error("Invalid credentials");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error("Invalid credentials");
        }

        return user;
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

        // Always fetch role fresh to prevent stale permission data in long-lived tokens
        // 1. Fetch user role from database.
        // 2. Assign role to user session for access control checks.
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub! },
          select: { role: true },
        });

        if (dbUser) {
          session.user.role = dbUser.role;
        }
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },

  debug: false,
};
