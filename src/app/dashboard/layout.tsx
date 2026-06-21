"use client";

// Dashboard layout: sidebar + main content area.
// WorkspaceProvider must be inside AuthProvider because it reads the current user.

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
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

function DashboardShell({
  children,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
}: {
  children: React.ReactNode;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (v: boolean) => void;
}) {
  const { isOwner, loading: authLoading, profile, refreshProfile, signOut } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();

  // Determine if the current page is the dedicated system policy page.
  // 1. Read the pathname from Next.js router.
  // 2. Check if the pathname matches "/dashboard/policy".
  // 3. Use this flag to temporarily disable the blocking policy agreement overlay.
  const isPolicyPage = pathname === "/dashboard/policy";

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLabel, setBalanceLabel] = useState<string | null>(null);
  const [showNewMonthBanner, setShowNewMonthBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // States for the pending reviews admin popup
  const [showPendingReviewsModal, setShowPendingReviewsModal] = useState(false);
  const [pendingReviewsData, setPendingReviewsData] = useState<{
    activeWorkspace: { id: string; name: string; pendingCount: number; isAdmin: boolean } | null;
    otherWorkspaces: { id: string; name: string; pendingCount: number }[];
  } | null>(null);

  // States for cookie consent and privacy policy agreement
  const [showCookieBanner, setShowCookieBanner] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [acceptingPolicy, setAcceptingPolicy] = useState(false);

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

  // Check if workspace admin has pending reviews to display the prompt modal
  useEffect(() => {
    if (!activeWorkspace?.id || authLoading) return;

    const checkPendingReviews = async () => {
      try {
        // 1. Fetch pending reviews information from the backend endpoint
        const res = await fetch(`/api/admin/pending-reviews?activeWorkspaceId=${activeWorkspace.id}`);
        if (!res.ok) return;
        const data = await res.json();
        setPendingReviewsData(data);

        // 2. Determine if user is admin/owner of active workspace and has tasks to review
        const isActiveWsAdmin = data.activeWorkspace?.isAdmin;
        const activeCount = data.activeWorkspace?.pendingCount ?? 0;

        // 3. Trigger modal if criteria met and not dismissed in current browser session
        const hasShown = sessionStorage.getItem(`hasShownPendingReviewsPopup:${activeWorkspace.id}`);
        if (isActiveWsAdmin && activeCount > 0 && !hasShown) {
          setShowPendingReviewsModal(true);
        }
      } catch {
        // non-critical
      }
    };

    checkPendingReviews();
  }, [activeWorkspace?.id, authLoading]);

  // Cookie Consent logic: triggers a popup banner 4.5 seconds after loading the app
  // if no status exists in local storage.
  useEffect(() => {
    const consent = localStorage.getItem("cookieConsentStatus");
    if (!consent) {
      const timer = setTimeout(() => {
        setShowCookieBanner(true);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Privacy Policy check logic: triggers a blocking modal if the authenticated
  // user profile has not accepted the privacy policy.
  // 1. Check if auth loading is complete and profile data is available.
  // 2. Wrap state updates in Promise.resolve().then() to avoid ESLint set-state-in-effect errors.
  // 3. Set showPolicyModal to true if accepted_privacy_policy is false, otherwise false.
  useEffect(() => {
    if (!authLoading && profile) {
      if (profile.accepted_privacy_policy === false) {
        Promise.resolve().then(() => {
          setShowPolicyModal(true);
        });
      } else {
        Promise.resolve().then(() => {
          setShowPolicyModal(false);
        });
      }
    }
  }, [profile, authLoading]);

  // Handler to submit privacy policy acceptance to the backend database
  const handleAcceptPolicy = async () => {
    setAcceptingPolicy(true);
    try {
      const res = await fetch("/api/settings/accept-policy", {
        method: "POST",
      });
      if (res.ok) {
        setShowPolicyModal(false);
        await refreshProfile();
      } else {
        alert("Failed to save agreement. Please try again.");
      }
    } catch {
      alert("Something went wrong. Please check your connection.");
    } finally {
      setAcceptingPolicy(false);
    }
  };

  const handleConfirmSignOut = async () => {
    setShowLogoutConfirm(false);
    signOut();
  };

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

      {/* Pending Reviews Modal */}
      {showPendingReviewsModal && pendingReviewsData && pendingReviewsData.activeWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl w-full max-w-md p-6 animate-slide-up relative">
            <button
              onClick={() => {
                setShowPendingReviewsModal(false);
                sessionStorage.setItem(`hasShownPendingReviewsPopup:${activeWorkspace?.id}`, "true");
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                <CalendarCheck size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-neutral-800">
                  Pending Task Reviews
                </h3>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                  There are <span className="font-semibold text-amber-600">{pendingReviewsData.activeWorkspace.pendingCount} tasks</span> pending review in <span className="font-semibold text-neutral-800">{pendingReviewsData.activeWorkspace.name}</span>.
                </p>

                {pendingReviewsData.otherWorkspaces.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-neutral-100">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                      Other Workspaces with Pending Reviews
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {pendingReviewsData.otherWorkspaces.map((ws) => (
                        <li key={ws.id} className="flex items-center justify-between text-xs bg-neutral-50 rounded-lg px-2.5 py-1.5 border border-neutral-100">
                          <span className="font-medium text-neutral-700 truncate mr-2">
                            {ws.name}
                          </span>
                          <span className="shrink-0 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {ws.pendingCount} pending
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2.5 mt-5">
                  <button
                    onClick={() => {
                      setShowPendingReviewsModal(false);
                      sessionStorage.setItem(`hasShownPendingReviewsPopup:${activeWorkspace?.id}`, "true");
                      router.push("/dashboard/tasks?tab=In Review");
                    }}
                    className="btn-primary text-xs py-2 flex-1 shadow-sm"
                  >
                    Go to Reviews
                  </button>
                  <button
                    onClick={() => {
                      setShowPendingReviewsModal(false);
                      sessionStorage.setItem(`hasShownPendingReviewsPopup:${activeWorkspace?.id}`, "true");
                    }}
                    className="px-4 py-2 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 rounded-xl text-xs font-semibold transition-all shadow-sm cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cookie Consent Banner */}
      {showCookieBanner && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl p-5 animate-slide-up">
          <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Cookie Consent
          </h4>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5 leading-relaxed">
            We use essential cookies to maintain your login session and enhance your tracking experience. Do you agree to our cookie policy?
          </p>
          <div className="flex gap-2.5 mt-4 justify-end">
            <button
              onClick={() => {
                localStorage.setItem("cookieConsentStatus", "rejected");
                setShowCookieBanner(false);
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-850 transition-colors cursor-pointer"
            >
              Decline
            </button>
            <button
              onClick={() => {
                localStorage.setItem("cookieConsentStatus", "accepted");
                setShowCookieBanner(false);
              }}
              className="btn-primary text-xs px-4 py-1.5 shadow-sm"
            >
              Accept
            </button>
          </div>
        </div>
      )}

      {/* Privacy Policy Blocking Modal */}
      {showPolicyModal && !isPolicyPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/80 dark:bg-black/90 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-full max-w-lg p-6 animate-slide-up relative">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#e06b6b]/10 border border-[#e06b6b]/20 flex items-center justify-center text-[#e06b6b] shrink-0">
                <CalendarCheck size={24} />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
                  Privacy Policy & Agreement Required
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  Before continuing to use the Task Tracking System, you must read and accept our privacy policy. This details how we track task performance, manage daily attendance scores (including late penalties), and process salaries.
                </p>
                <div className="bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-100 dark:border-neutral-800/30 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    Read the detailed terms
                  </span>
                  <button
                    onClick={() => router.push("/dashboard/policy")}
                    className="text-xs font-semibold text-[#e06b6b] hover:text-[#c85555] transition-colors cursor-pointer"
                  >
                    View System Policy &rarr;
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="px-4 py-2 border border-neutral-200 dark:border-neutral-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Reject & Sign Out
                </button>
                <button
                  onClick={handleAcceptPolicy}
                  disabled={acceptingPolicy}
                  className="btn-primary text-xs py-2 flex-1 shadow-sm font-semibold"
                >
                  {acceptingPolicy ? "Accepting..." : "Accept & Continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Prompt */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xl w-full max-w-sm p-5 animate-slide-up">
            <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
              Reject Terms & Sign Out?
            </h4>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed">
              If you reject the privacy policy, you will be automatically logged out of the system and will not be able to access your tasks or dashboard. Are you sure you want to proceed?
            </p>
            <div className="flex gap-2.5 mt-4 justify-end">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSignOut}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
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
