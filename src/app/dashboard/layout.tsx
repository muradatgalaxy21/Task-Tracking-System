"use client";

// Dashboard layout: sidebar + main content area.
// WorkspaceProvider must be inside AuthProvider because it reads the current user.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/providers/AuthProvider";
import { WorkspaceProvider, useWorkspace } from "@/components/providers/WorkspaceProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import Sidebar from "@/components/layout/Sidebar";
import NotificationsBell from "@/components/layout/NotificationsBell";
import { Menu, DollarSign, CalendarCheck, X } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <AuthProvider>
      <WorkspaceProvider>
        <ThemeProvider>
          <DashboardShell isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen}>
            {children}
          </DashboardShell>
        </ThemeProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}

// Inner shell that can access AuthProvider and WorkspaceProvider context
function DashboardShell({
  children,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
}: {
  children: React.ReactNode;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (v: boolean) => void;
}) {
  const { isOwner, loading: authLoading } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLabel, setBalanceLabel] = useState<string | null>(null);
  const [showNewMonthBanner, setShowNewMonthBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Fetch the current user's latest finalized salary
  useEffect(() => {
    if (!activeWorkspace?.id || authLoading) return;

    const fetchBalance = async () => {
      try {
        const res = await fetch(`/api/user/payout-balance?workspaceId=${activeWorkspace.id}`);
        if (!res.ok) return;
        const data = await res.json();
        setBalance(data.balance ?? null);
        setBalanceLabel(data.label ?? null);
      } catch {
        // non-critical
      }
    };

    fetchBalance();
  }, [activeWorkspace?.id, authLoading]);

  // Check if owner should see the new-month prompt
  // Compares current month against the latest finalized close for the workspace
  useEffect(() => {
    if (!isOwner || !activeWorkspace?.id || authLoading || bannerDismissed) return;

    const checkNewMonth = async () => {
      try {
        const res = await fetch(`/api/monthly-close?workspaceId=${activeWorkspace.id}`);
        if (!res.ok) return;
        const closes: { month: number; year: number; status: string }[] = await res.json();

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const lastFinalized = closes
          .filter((c) => c.status === "Finalized")
          .sort((a, b) => b.year - a.year || b.month - a.month)[0];

        if (!lastFinalized) {
          // No close ever — prompt if it's not the very first day of any month
          setShowNewMonthBanner(true);
          return;
        }

        const isCurrentMonthClosed =
          lastFinalized.month === currentMonth && lastFinalized.year === currentYear;

        if (!isCurrentMonthClosed) {
          setShowNewMonthBanner(true);
        }
      } catch {
        // non-critical
      }
    };

    checkNewMonth();
  }, [isOwner, activeWorkspace?.id, authLoading, bannerDismissed]);

  return (
    <div className="min-h-screen bg-gradient-radial">
      {/* Mobile top header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 bg-white/90 backdrop-blur-sm border-b border-neutral-200/60">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-1 rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #e06b6b, #c85555)" }}
            >
              <span className="text-white text-[10px] font-bold">AB</span>
            </div>
            <span className="text-sm font-semibold text-neutral-800">AI & Beyond</span>
          </div>
        </div>
        <NotificationsBell />
      </header>

      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

      {/* Desktop top-right: balance chip + notification bell */}
      <div className="fixed top-6 right-6 z-40 hidden md:flex items-center gap-3">
        {balance !== null && (
          <button
            onClick={() => router.push("/dashboard/history")}
            className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-neutral-200/70 rounded-full px-3 py-1.5 shadow-sm hover:shadow-md transition-all group"
            title={`Last salary: ${balanceLabel}`}
          >
            <DollarSign size={13} className="text-green-500" />
            <span className="text-xs font-semibold text-neutral-700 group-hover:text-neutral-900 transition-colors">
              {balance.toLocaleString()} PKR
            </span>
            {balanceLabel && (
              <span className="text-[10px] text-neutral-400 ml-0.5">{balanceLabel}</span>
            )}
          </button>
        )}
        <NotificationsBell />
      </div>

      {/* Main content */}
      <main className="md:ml-[260px] pt-14 md:pt-0 p-4 md:p-6 lg:p-8 transition-all duration-200">
        {/* New month banner for Owner */}
        {showNewMonthBanner && !bannerDismissed && (
          <NewMonthBanner
            onDismiss={() => { setBannerDismissed(true); setShowNewMonthBanner(false); }}
            onGo={() => { setBannerDismissed(true); setShowNewMonthBanner(false); router.push("/dashboard/month-end"); }}
          />
        )}
        {children}
      </main>
    </div>
  );
}

// Banner shown to Owners when a new month has not been closed yet
function NewMonthBanner({ onDismiss, onGo }: { onDismiss: () => void; onGo: () => void }) {
  const now = new Date();
  const monthName = now.toLocaleString("en-PK", { month: "long" });
  const year = now.getFullYear();

  return (
    <div className="mb-6 flex items-center gap-4 bg-amber-50 border border-amber-200/70 rounded-xl px-4 py-3 animate-fade-in">
      <CalendarCheck size={18} className="text-amber-500 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-neutral-800">
          Month-End Close Pending
        </p>
        <p className="text-xs text-neutral-500 mt-0.5">
          {monthName} {year} has not been closed yet. Run the month-end close to finalize member salaries.
        </p>
      </div>
      <button
        onClick={onGo}
        className="btn-primary text-xs px-3 py-1.5 shrink-0"
      >
        Go to Month End
      </button>
      <button
        onClick={onDismiss}
        className="text-neutral-400 hover:text-neutral-600 transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
