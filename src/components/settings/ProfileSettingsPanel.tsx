"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Loader2, Check, Camera, Trash2 } from "lucide-react";
import UserAvatar from "@/components/common/UserAvatar";

type ProfileData = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  image: string | null;
};

export default function ProfileSettingsPanel() {
  const { user, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please select a valid image file." });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "Image size must be less than 5MB." });
      return;
    }

    setUploadingImage(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const uploadData = await uploadRes.json();
        throw new Error(uploadData.error || "Upload failed");
      }

      const { url } = await uploadRes.json();

      const patchRes = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: url }),
      });

      if (!patchRes.ok) {
        const patchData = await patchRes.json();
        throw new Error(patchData.error || "Failed to update profile image.");
      }

      setProfile((prev) => prev ? { ...prev, image: url } : null);
      await refreshProfile();
      setMessage({ type: "success", text: "Profile photo updated successfully." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to upload profile photo." });
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleDeletePhoto = async () => {
    if (!confirm("Are you sure you want to remove your profile photo?")) return;

    setUploadingImage(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: null }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove profile photo.");
      }

      setProfile((prev) => prev ? { ...prev, image: null } : null);
      await refreshProfile();
      setMessage({ type: "success", text: "Profile photo removed." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to remove profile photo." });
    } finally {
      setUploadingImage(false);
    }
  };

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

      {/* Profile picture upload */}
      <div className="flex items-center gap-5 pb-2 border-b border-neutral-100">
        <div className="relative group shrink-0">
          <UserAvatar
            fullName={profile.full_name}
            image={profile.image}
            size={70}
            className="rounded-full shadow-inner border border-neutral-200"
          />
          {uploadingImage && (
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="space-y-1.5 flex-1 min-w-0">
          <span className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
            Profile Photo
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={uploadingImage}
              onClick={() => document.getElementById("avatar-upload-input")?.click()}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-all flex items-center gap-1.5 text-neutral-700 disabled:opacity-50 cursor-pointer"
            >
              <Camera size={13} />
              Upload Photo
            </button>
            {profile.image && (
              <button
                type="button"
                disabled={uploadingImage}
                onClick={handleDeletePhoto}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50/50 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 size={13} />
                Remove
              </button>
            )}
          </div>
          <input
            id="avatar-upload-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <p className="text-[10px] text-neutral-400">
            JPG, PNG or GIF. Max 5MB.
          </p>
        </div>
      </div>

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
