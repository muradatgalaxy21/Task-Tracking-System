"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, ArrowRight, Building2, Users } from "lucide-react";

type OnboardingStep = "loading" | "workspace" | "workspace-form" | "profile";
type WorkspaceAction = "create" | "join";

export default function OnboardingPage() {
  const { update } = useSession();
  const router = useRouter();

  const [step, setStep] = useState<OnboardingStep>("loading");
  const [workspaceAction, setWorkspaceAction] = useState<WorkspaceAction | null>(null);

  // Workspace form fields
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  // Profile form fields
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // On mount, check if the user already belongs to any workspace
  useEffect(() => {
    fetch("/api/workspaces")
      .then((res) => res.json())
      .then((data) => {
        // If the user has no workspace memberships, show the workspace setup step first
        if (Array.isArray(data) && data.length === 0) {
          setStep("workspace");
        } else {
          setStep("profile");
        }
      })
      .catch(() => {
        // On fetch failure, skip workspace step and proceed to profile
        setStep("profile");
      });
  }, []);

  // Handle workspace creation
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!workspaceName.trim()) {
      setError("Please enter a workspace name.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create workspace.");
      }

      // Workspace created — proceed to profile step
      setStep("profile");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Handle workspace join via invite code
  const handleJoinWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!inviteCode.trim()) {
      setError("Please enter an invite code.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/workspaces/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to join workspace.");
      }

      // Joined successfully — proceed to profile step
      setStep("profile");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  // Handle profile completion
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !dob) {
      setError("Please fill in all fields.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/user/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim(), dob }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to save profile.");
      }

      // Sync the session so full_name appears immediately in the UI
      await update({ full_name: fullName.trim() });

      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faebd7] p-4 relative overflow-hidden">
      {/* Decorative background blobs */}
      <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-[#7b2c51]/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-[#7b2c51]/10 rounded-full blur-3xl" />

      <div className="w-full max-w-md bg-white border border-gray-100 rounded-3xl shadow-2xl p-10 relative z-10 animate-in fade-in zoom-in duration-500">
        <div className="flex justify-center mb-8">
          <Image src="/images/logo.png" alt="AI and Beyond" width={60} height={60} className="object-contain" />
        </div>

        {/* ---- Loading state ---- */}
        {step === "loading" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-[#7b2c51]" />
            <p className="text-sm text-gray-400">Setting things up...</p>
          </div>
        )}

        {/* ---- Workspace choice step ---- */}
        {step === "workspace" && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-800">Get Started</h1>
              <p className="text-sm text-gray-500 mt-2">
                Create a workspace for your team or join an existing one.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setWorkspaceAction("create"); setError(""); setStep("workspace-form"); }}
                className="flex items-start gap-4 p-4 rounded-2xl border border-gray-200 hover:border-[#7b2c51] hover:bg-[#7b2c51]/4 text-left transition-all group"
              >
                <div className="w-9 h-9 rounded-xl bg-[#7b2c51]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#7b2c51]/20 transition-colors">
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
                onClick={() => { setWorkspaceAction("join"); setError(""); setStep("workspace-form"); }}
                className="flex items-start gap-4 p-4 rounded-2xl border border-gray-200 hover:border-[#7b2c51] hover:bg-[#7b2c51]/4 text-left transition-all group"
              >
                <div className="w-9 h-9 rounded-xl bg-[#7b2c51]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#7b2c51]/20 transition-colors">
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
          </>
        )}

        {/* ---- Workspace form step ---- */}
        {step === "workspace-form" && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-800">
                {workspaceAction === "create" ? "Name Your Workspace" : "Enter Invite Code"}
              </h1>
              <p className="text-sm text-gray-500 mt-2">
                {workspaceAction === "create"
                  ? "This will be your team's home in AI and Beyond."
                  : "Paste the invite code shared by your team admin."}
              </p>
            </div>

            {error && (
              <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                {error}
              </div>
            )}

            <form
              onSubmit={workspaceAction === "create" ? handleCreateWorkspace : handleJoinWorkspace}
              className="space-y-5"
            >
              {workspaceAction === "create" ? (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-tight">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="Your agency name"
                    className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#7b2c51] focus:border-transparent outline-none transition-all text-gray-800"
                    required
                    disabled={loading}
                    autoFocus
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-tight">
                    Invite Code
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Paste your invite code"
                    className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#7b2c51] focus:border-transparent outline-none transition-all text-gray-800 font-mono tracking-wider"
                    required
                    disabled={loading}
                    autoFocus
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-[#7b2c51] hover:bg-[#622a44] text-white py-4 px-6 rounded-2xl font-bold transition-all shadow-lg shadow-[#7b2c51]/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{workspaceAction === "create" ? "Creating..." : "Joining..."}</span>
                  </>
                ) : (
                  <>
                    <span>{workspaceAction === "create" ? "Create Workspace" : "Join Workspace"}</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setStep("workspace"); setError(""); }}
                className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Back
              </button>
            </form>
          </>
        )}

        {/* ---- Profile step ---- */}
        {step === "profile" && (
          <>
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold text-gray-800">Complete Your Profile</h1>
              <p className="text-sm text-gray-500 mt-2 italic">
                Just a few more details to get you started with AI and Beyond.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-6">
              <div>
                <label htmlFor="fullName" className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-tight">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#7b2c51] focus:border-transparent outline-none transition-all text-gray-800"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="dob" className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-tight">
                  Date of Birth
                </label>
                <input
                  id="dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#7b2c51] focus:border-transparent outline-none transition-all text-gray-800"
                  required
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !fullName.trim() || !dob}
                className="w-full flex items-center justify-center gap-2 bg-[#7b2c51] hover:bg-[#622a44] text-white py-4 px-6 rounded-2xl font-bold transition-all shadow-lg shadow-[#7b2c51]/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Saving Profile...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Dashboard</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
