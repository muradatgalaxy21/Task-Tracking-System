import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const metadata = { title: "Admin Panel — AI and Beyond" };

// Server component — verifies Owner role before rendering any child page.
// Non-authenticated users are sent to /login; non-Owners to /dashboard.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Read role directly from DB to prevent stale JWT token bypass
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, email: true },
  });

  if (dbUser?.role !== "Owner") {
    redirect("/dashboard");
  }

  return (
    <div
      className="min-h-screen bg-[#0c0c0f]"
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Admin top bar */}
      <div className="bg-[#12131a] border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest border border-red-400/30 px-2 py-0.5 rounded">
            Admin Panel
          </span>
          <span className="text-sm font-semibold text-white/70">AI and Beyond</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-white/30">{dbUser?.email}</span>
          <Link
            href="/dashboard"
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Page content */}
      <div className="max-w-5xl mx-auto px-6 py-8">{children}</div>
    </div>
  );
}
