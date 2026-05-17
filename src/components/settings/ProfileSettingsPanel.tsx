"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Loader2, Check } from "lucide-react";
import { getDisplayName } from "next/dist/shared/lib/utils";

type ProfileData = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
};

export default function ProfileSettingsPanel() {
  const { user, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/settings/profile");
      if (res.ok) {
        const data: ProfileData = await res.json();
        setProfile(data);
        setFullName(data.full_name ?? "");
      }
    }
    load();
  }, [user?.id]);

  const handleSave = async () => {
    if (!fullName.trim()) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save profile." });
        return;
      }

      if (data.needsVerification) {
        // Admin/Owner path: email verification required
        setMessage({
          type: "info",
          text: "A verification link has been sent to your email. Click it to apply your changes.",
        });
      } else {
        // Member/Guest path: applied directly
        setMessage({ type: "success", text: "Profile updated." });
        setProfile((prev) => prev ? { ...prev, full_name: data.user.full_name } : prev);
        await refreshProfile();
      }
    } catch {
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-neutral-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading profile...
      </div>
    );
  }

  const isElevated = profile.role === "Owner" || profile.role === "Admin";

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-neutral-800">Profile</h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          {isElevated
            ? "Changes to your name require email confirmation before they are applied."
            : "Changes are applied immediately."}
        </p>
      </div>

      {/* Full name */}
      <div>
        <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
          Full Name
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); setMessage(null); }}
          placeholder="Your full name"
          className="glass-input text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
      </div>

      {/* Email — read-only */}
      <div>
        <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
          Email
        </label>
        <input
          type="email"
          value={profile.email ?? ""}
          readOnly
          className="glass-input text-sm bg-neutral-50 text-neutral-400 cursor-not-allowed"
        />
        <p className="text-[10px] text-neutral-400 mt-1">
          Email is tied to your account and cannot be changed here.
        </p>
      </div>

      {/* Global role — display only */}
      <div>
        <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
          Global Role
        </label>
        <div className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600">
          {profile.role}
        </div>
      </div>

      {/* Appearance: dark mode toggle — preference is stored in localStorage,
          applies only to this user's browser session */}
      <div className="border-t border-neutral-200 pt-4" style={{ display: isElevated ? "none" : "block" }}> {/* to be changed */}
        <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
          Appearance
        </label>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-700">Dark Mode</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              Applies only to your personal session.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e06b6b] focus-visible:ring-offset-2 ${
              theme === "dark" ? "bg-[#e06b6b]" : "bg-neutral-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                theme === "dark" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-xs ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : message.type === "info"
              ? "bg-blue-50 border border-blue-200 text-blue-700"
              : "bg-red-50 border border-red-200 text-red-600"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !fullName.trim() || fullName.trim() === (profile.full_name ?? "")}
          className="btn-primary text-sm py-2 px-5 flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}
