"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Loader2, ArrowLeft, Building2, Users } from "lucide-react";

type AuthStep = "email" | "workspace" | "credentials";
type WorkspaceAction = "create" | "join" | null;

export default function AuthPage() {
  const router = useRouter();

  const [isSignup, setIsSignup] = useState(false);
  const [step, setStep] = useState<AuthStep>("email");
  const [workspaceAction, setWorkspaceAction] = useState<WorkspaceAction>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const resetForm = () => {
    setStep("email");
    setWorkspaceAction(null);
    setError("");
    setSuccess(false);
    setPassword("");
    setWorkspaceName("");
    setInviteCode("");
  };

  const toggleMode = () => {
    setIsSignup((prev) => !prev);
    resetForm();
  };

  // Step 1: check if email exists and route the user to the correct flow
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/user/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) throw new Error("Failed to verify email.");
      const { exists } = await res.json();

      if (isSignup) {
        if (exists) {
          setError("An account with this email already exists. Try signing in instead.");
          return;
        }
        // New user: prompt to set up or join a workspace
        setStep("workspace");
      } else {
        if (!exists) {
          setError("No account found for this email. Try creating an account instead.");
          return;
        }
        setStep("credentials");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2 (signup only): select how the user wants to set up their workspace
  const handleWorkspaceChoice = (action: WorkspaceAction) => {
    setWorkspaceAction(action);
    setStep("credentials");
    setError("");
  };

  // Final step (login): authenticate with credentials
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password.trim()) {
      setError("Please enter your passcode.");
      return;
    }

    try {
      setLoading(true);
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid passcode. Please try again.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Final step (signup): create account with optional workspace creation or joining
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Passcode must be at least 8 characters.");
      return;
    }

    if (workspaceAction === "create" && !workspaceName.trim()) {
      setError("Please enter a workspace name.");
      return;
    }

    if (workspaceAction === "join" && !inviteCode.trim()) {
      setError("Please enter an invite code.");
      return;
    }

    try {
      setLoading(true);

      const body: Record<string, string> = { email: email.trim(), password };
      if (workspaceAction === "create") body.workspaceName = workspaceName.trim();
      if (workspaceAction === "join") body.inviteCode = inviteCode.trim();

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to create account.");
      }

      setSuccess(true);

      // Auto sign-in immediately after account creation
      const loginResult = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (loginResult?.error) {
        // Account was created; fall back to manual login
        setIsSignup(false);
        setStep("credentials");
        setSuccess(false);
        return;
      }

      router.push("/onboarding");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // OAuth sign-in via Google or GitHub
  const handleOAuth = async (provider: "google" | "github") => {
    setOauthLoading(provider);
    try {
      await signIn(provider, { callbackUrl: "/dashboard" });
    } finally {
      setOauthLoading(null);
    }
  };

  return (
    <div
      className="min-h-screen flex w-full"
      style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
    >
      {/* LEFT: Authentication form */}
      <div className="w-full lg:w-[460px] xl:w-[500px] flex flex-col items-center justify-center px-10 py-14 bg-white relative z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.06)]">
        <div className="w-full max-w-[340px]">

          {/* Logo and brand name */}
          <div className="flex items-center gap-2.5 mb-10">
            <Image
              src="/images/logo.png"
              alt="AI and Beyond"
              width={32}
              height={32}
              className="object-contain"
            />
            <span className="text-sm font-semibold text-gray-900 tracking-tight">
              AI and Beyond
            </span>
          </div>

          {/* Heading and subtext */}
          <div className="mb-7">
            <h1 className="text-[22px] font-bold text-gray-900 leading-snug mb-1.5">
              Manage your agency workflow.
            </h1>
            <p className="text-sm text-gray-400 leading-relaxed">
              Workspace Access — sign in to continue.
            </p>
          </div>

          {/* OAuth buttons */}
          <div className="flex flex-col gap-2.5 mb-6">
            <button
              onClick={() => handleOAuth("google")}
              disabled={!!oauthLoading || loading}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {oauthLoading === "google" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Continue with Google
            </button>

            <button
              onClick={() => handleOAuth("github")}
              disabled={!!oauthLoading || loading}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-[#24292f] hover:bg-[#1c2128] text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {oauthLoading === "github" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <GithubIcon />
              )}
              Continue with GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] text-gray-400 font-medium tracking-wide">
              or continue with email
            </span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm leading-snug">
              {error}
            </div>
          )}

          {/* Success banner */}
          {success && (
            <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-green-50 border border-green-100 text-green-700 text-sm font-medium">
              Account created. Setting up your workspace...
            </div>
          )}

          {/* --- Step: Email entry --- */}
          {step === "email" && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-[#7b2c51]/20 focus:border-[#7b2c51] outline-none transition-all bg-gray-50"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-[#7b2c51] text-white text-sm font-semibold hover:bg-[#621f3e] active:scale-[0.98] transition-all flex items-center justify-center shadow-sm"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
              </button>
            </form>
          )}

          {/* --- Step: Workspace setup (signup only) --- */}
          {step === "workspace" && (
            <div>
              <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-500">
                New account for{" "}
                <span className="font-medium text-gray-700">{email}</span>. How do you want to get started?
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => handleWorkspaceChoice("create")}
                  className="flex items-start gap-3 p-3.5 rounded-lg border border-gray-200 hover:border-[#7b2c51] hover:bg-[#7b2c51]/4 text-left transition-all group"
                >
                  <div className="w-8 h-8 rounded-md bg-[#7b2c51]/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#7b2c51]/20 transition-colors">
                    <Building2 className="w-4 h-4 text-[#7b2c51]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Create a Workspace</div>
                    <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                      Start a new agency workspace for your team.
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleWorkspaceChoice("join")}
                  className="flex items-start gap-3 p-3.5 rounded-lg border border-gray-200 hover:border-[#7b2c51] hover:bg-[#7b2c51]/4 text-left transition-all group"
                >
                  <div className="w-8 h-8 rounded-md bg-[#7b2c51]/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#7b2c51]/20 transition-colors">
                    <Users className="w-4 h-4 text-[#7b2c51]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Join a Team</div>
                    <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                      Join an existing workspace using an invite code.
                    </div>
                  </div>
                </button>
              </div>

              <button
                onClick={() => { setStep("email"); setError(""); }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mt-4 transition-colors"
              >
                <ArrowLeft size={11} /> Back
              </button>
            </div>
          )}

          {/* --- Step: Credentials (login or signup) --- */}
          {step === "credentials" && (
            <form
              onSubmit={isSignup ? handleSignup : handleLogin}
              className="space-y-4"
            >
              {/* Locked email row with change option */}
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <span className="text-sm text-gray-600 truncate">{email}</span>
                <button
                  type="button"
                  onClick={() => { setStep("email"); setError(""); }}
                  className="text-xs text-[#7b2c51] hover:underline font-medium ml-3 flex-shrink-0"
                >
                  Change
                </button>
              </div>

              {/* Workspace name field (signup + create flow) */}
              {isSignup && workspaceAction === "create" && (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="Your agency name"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-[#7b2c51]/20 focus:border-[#7b2c51] outline-none transition-all bg-gray-50"
                    required
                    autoFocus
                  />
                </div>
              )}

              {/* Invite code field (signup + join flow) */}
              {isSignup && workspaceAction === "join" && (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                    Invite Code
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Paste your invite code"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-[#7b2c51]/20 focus:border-[#7b2c51] outline-none transition-all bg-gray-50 font-mono tracking-wider"
                    required
                    autoFocus
                  />
                </div>
              )}

              {/* Passcode field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    {isSignup ? "Create Passcode (8+ digits)" : "Passcode"}
                  </label>
                  {!isSignup && workspaceAction === null && (
                    <Link
                      href="/auth/forgot-password"
                      className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Forgot?
                    </Link>
                  )}
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value.replace(/\D/g, "").slice(0, 12))
                  }
                  placeholder="Numeric passcode"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-[#7b2c51]/20 focus:border-[#7b2c51] outline-none transition-all bg-gray-50"
                  required
                  minLength={8}
                  autoFocus={workspaceAction !== "create" && workspaceAction !== "join"}
                />
              </div>

              <button
                type="submit"
                disabled={loading || success}
                className="w-full py-2.5 rounded-lg bg-[#7b2c51] text-white text-sm font-semibold hover:bg-[#621f3e] active:scale-[0.98] transition-all flex items-center justify-center shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isSignup ? (
                  "Create Account"
                ) : (
                  "Sign In"
                )}
              </button>

              {/* Back to workspace choice (signup only) */}
              {isSignup && (
                <button
                  type="button"
                  onClick={() => { setStep("workspace"); setError(""); }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <ArrowLeft size={11} /> Back
                </button>
              )}
            </form>
          )}

          {/* Mode toggle */}
          <p className="text-center mt-7 text-gray-400 text-xs">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={toggleMode}
              className="text-[#7b2c51] font-semibold hover:underline"
            >
              {isSignup ? "Sign in" : "Create account"}
            </button>
          </p>
        </div>
      </div>

      {/* RIGHT: Dashboard preview panel */}
      <div className="hidden lg:block flex-1 relative bg-[#0d1117] overflow-hidden">
        <DashboardPreview />

        {/* Bottom gradient fade */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0d1117] to-transparent pointer-events-none" />

        {/* Caption at the bottom */}
        <div className="absolute inset-x-0 bottom-8 flex justify-center pointer-events-none">
          <p className="text-white/30 text-xs font-medium tracking-wide">
            Your agency workspace, one sign-in away.
          </p>
        </div>
      </div>
    </div>
  );
}

// --- Dashboard preview mockup ---

function DashboardPreview() {
  const tasks = [
    { title: "Redesign client landing page", status: "In Progress", assignee: "M", days: 2 },
    { title: "API integration with CRM system", status: "In Review", assignee: "A", days: 1 },
    { title: "Write Q3 performance case studies", status: "Todo", assignee: "Mj", days: 5 },
    { title: "Set up agency analytics pipeline", status: "Completed", assignee: "AA", days: 3 },
    { title: "Client onboarding documentation", status: "In Progress", assignee: "M", days: 4 },
  ];

  const statusStyle: Record<string, string> = {
    "In Progress": "bg-blue-500/15 text-blue-300",
    "In Review": "bg-amber-500/15 text-amber-300",
    "Todo": "bg-gray-500/15 text-gray-400",
    "Completed": "bg-emerald-500/15 text-emerald-300",
  };

  const avatarColor: Record<string, string> = {
    M: "bg-[#7b2c51]",
    A: "bg-blue-600",
    Mj: "bg-emerald-600",
    AA: "bg-violet-600",
  };

  return (
    <div className="absolute inset-0 flex opacity-75">
      {/* Sidebar */}
      <div className="w-44 bg-[#161b22] border-r border-white/5 flex flex-col py-5 px-2.5 flex-shrink-0">
        <div className="flex items-center gap-2 px-2 mb-5">
          <div className="w-4 h-4 rounded bg-[#7b2c51] flex-shrink-0" />
          <span className="text-[11px] font-semibold text-white/70 truncate">AI and Beyond</span>
        </div>

        {["Dashboard", "Tasks", "Attendance", "Payout", "Members"].map((item, i) => (
          <div
            key={item}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md mb-0.5 text-[11px] ${
              i === 0
                ? "bg-white/8 text-white/80 font-medium"
                : "text-white/30"
            }`}
          >
            <div
              className={`w-1 h-1 rounded-full flex-shrink-0 ${
                i === 0 ? "bg-[#7b2c51]" : "bg-white/15"
              }`}
            />
            {item}
          </div>
        ))}

        <div className="mt-auto pt-4 border-t border-white/5">
          <div className="text-[9px] text-white/20 uppercase tracking-widest px-2 mb-1.5">Workspace</div>
          <div className="flex items-center gap-1.5 px-2 py-1">
            <div className="w-3.5 h-3.5 rounded bg-[#7b2c51]/50 flex-shrink-0" />
            <span className="text-[10px] text-white/30 truncate">Agency HQ</span>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header bar */}
        <div className="h-11 border-b border-white/5 flex items-center px-5 flex-shrink-0">
          <span className="text-[13px] font-semibold text-white/70">Dashboard</span>
          <div className="ml-auto flex items-center gap-1.5">
            {[
              { label: "M", color: "bg-[#7b2c51]" },
              { label: "A", color: "bg-blue-600" },
              { label: "Mj", color: "bg-emerald-600" },
              { label: "AA", color: "bg-violet-600" },
            ].map((a) => (
              <div
                key={a.label}
                className={`w-6 h-6 rounded-full ${a.color} text-[9px] font-bold text-white flex items-center justify-center flex-shrink-0`}
              >
                {a.label}
              </div>
            ))}
          </div>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-hidden p-5">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            {[
              { label: "Active Tasks", value: "12", trend: "+3 this week" },
              { label: "Completion Rate", value: "84%", trend: "Above target" },
              { label: "Score Multiplier", value: "2.4x", trend: "Team average" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white/[0.04] rounded-lg p-3 border border-white/5"
              >
                <div className="text-[9px] text-white/30 mb-1 uppercase tracking-wider">{stat.label}</div>
                <div className="text-[18px] font-bold text-white/85 leading-none">{stat.value}</div>
                <div className="text-[9px] text-emerald-400/80 mt-1.5">{stat.trend}</div>
              </div>
            ))}
          </div>

          {/* Task list header */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-white/60">Tasks</span>
              <div className="flex gap-1">
                {["All", "Todo", "In Progress", "In Review"].map((tab, i) => (
                  <span
                    key={tab}
                    className={`text-[9px] px-2 py-0.5 rounded-full ${
                      i === 0
                        ? "bg-white/10 text-white/70"
                        : "text-white/25"
                    }`}
                  >
                    {tab}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-[9px] px-2 py-1 rounded bg-[#7b2c51] text-white font-medium">
              + New Task
            </div>
          </div>

          {/* Task table */}
          <div className="rounded-lg border border-white/5 overflow-hidden">
            <div className="grid grid-cols-12 text-[8px] text-white/25 border-b border-white/5 px-3.5 py-2 uppercase tracking-wider">
              <div className="col-span-6">Title</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-2">Assignee</div>
              <div className="col-span-1">Days</div>
            </div>

            {tasks.map((task, i) => (
              <div
                key={i}
                className={`grid grid-cols-12 items-center px-3.5 py-2 text-[10px] border-b border-white/[0.03] ${
                  i % 2 === 0 ? "bg-white/[0.01]" : ""
                }`}
              >
                <div className="col-span-6 text-white/65 font-medium truncate pr-2">
                  {task.title}
                </div>
                <div className="col-span-3">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${statusStyle[task.status]}`}
                  >
                    {task.status}
                  </span>
                </div>
                <div className="col-span-2">
                  <div
                    className={`w-5 h-5 rounded-full ${avatarColor[task.assignee]} text-[8px] font-bold text-white flex items-center justify-center`}
                  >
                    {task.assignee}
                  </div>
                </div>
                <div className="col-span-1 text-white/25 text-[9px]">{task.days}d</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Inline SVG icons ---

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
