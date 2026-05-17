"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import ProfileSettingsPanel from "@/components/settings/ProfileSettingsPanel";
import WorkspaceSettingsPanel from "@/components/settings/WorkspaceSettingsPanel";

type Tab = "profile" | "workspace";

function SettingsContent() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const searchParams = useSearchParams();

  // Show the correct tab based on query param; default to profile
  const [activeTab, setActiveTab] = useState<Tab>(
    searchParams.get("tab") === "workspace" ? "workspace" : "profile"
  );

  // Handle verify= query param from the email verification redirect
  const verifyStatus = searchParams.get("verify");

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-neutral-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Settings</h1>
        <p className="text-sm text-neutral-400 mt-0.5">
          Manage your profile and workspace configuration.
        </p>
      </div>

      {/* Email verification result banners */}
      {verifyStatus === "success" && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Profile updated successfully.
        </div>
      )}
      {verifyStatus === "expired" && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          The verification link has expired. Please save your profile again to receive a new link.
        </div>
      )}
      {(verifyStatus === "invalid" || verifyStatus === "error") && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          The verification link is invalid. Please try again.
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-neutral-200">
        <nav className="flex gap-6">
          {(["profile", "workspace"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-[#7b2c51] text-[#7b2c51]"
                  : "border-transparent text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {tab === "workspace" ? `Workspace${activeWorkspace ? `: ${activeWorkspace.name}` : ""}` : tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "profile" && <ProfileSettingsPanel />}
      {activeTab === "workspace" && <WorkspaceSettingsPanel />}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
