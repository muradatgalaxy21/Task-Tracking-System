"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Loader2, Check, Camera, Trash2, X, AlertTriangle } from "lucide-react";
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

  // State variables for the account deletion flow
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [fetchingStatus, setFetchingStatus] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<{
    isSoleGlobalOwner: boolean;
    deletedWorkspaces: { id: string; name: string }[];
    transferWorkspaces: {
      id: string;
      name: string;
      members: { id: string; full_name: string | null; email: string | null }[];
    }[];
  } | null>(null);
  const [transfers, setTransfers] = useState<Record<string, string>>({});
  const [understood, setUnderstood] = useState(false);
  const [deleteRequestLoading, setDeleteRequestLoading] = useState(false);
  const [deleteRequestError, setDeleteRequestError] = useState("");
  const [deleteRequestSuccess, setDeleteRequestSuccess] = useState(false);

  // 1. Fetches current account deletion eligibility status (workspaces, members, roles).
  // 2. Prepares local states and displays the confirmation dialog.
  const handleOpenDeleteModal = async () => {
    setFetchingStatus(true);
    setDeleteRequestError("");
    setDeleteRequestSuccess(false);
    setUnderstood(false);
    setTransfers({});
    try {
      const res = await fetch("/api/settings/delete-account/status");
      if (!res.ok) {
        throw new Error("Failed to retrieve account deletion requirements.");
      }
      const data = await res.json();
      setDeleteStatus(data);
      setShowDeleteModal(true);
    } catch (err) {
      // 1. Capture error on status retrieval failure
      // 2. Set user-facing error message with fallback text
      const errorMessage = err instanceof Error ? err.message : "Failed to retrieve account deletion status.";
      setMessage({ type: "error", text: errorMessage });
    } finally {
      setFetchingStatus(false);
    }
  };

  // 1. Validates that ownership transfers are selected for all populated workspaces.
  // 2. Dispatches transfer mapping and requests a secure deletion link via POST request.
  const handleRequestDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteRequestError("");

    if (deleteStatus) {
      for (const ws of deleteStatus.transferWorkspaces) {
        if (!transfers[ws.id]) {
          setDeleteRequestError(`Please specify a new owner for "${ws.name}".`);
          return;
        }
      }
    }

    setDeleteRequestLoading(true);
    try {
      const res = await fetch("/api/settings/delete-account/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfers }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Request failed.");
      }

      setDeleteRequestSuccess(true);
    } catch (err) {
      // 1. Capture error on deletion link request failure
      // 2. Set delete error state with fallback text
      const errorMessage = err instanceof Error ? err.message : "Unable to request account deletion.";
      setDeleteRequestError(errorMessage);
    } finally {
      setDeleteRequestLoading(false);
    }
  };

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

      // 1. Send the file payload to the local upload API route.
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      // 2. Read response body as text first to avoid stream locking or double-read errors.
      const responseText = await uploadRes.text();

      // 3. Handle non-ok status codes by reading custom error JSON or falling back to raw text.
      if (!uploadRes.ok) {
        let errMsg = "Upload failed";
        try {
          const uploadData = JSON.parse(responseText);
          errMsg = uploadData.error || errMsg;
        } catch {
          errMsg = responseText || errMsg;
        }
        throw new Error(errMsg);
      }

      // 4. Parse the success response from the text we already retrieved.
      const { url } = JSON.parse(responseText);

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
    } catch (err) {
      // 1. Capture error on profile image upload failure
      // 2. Set error banner message with fallback text
      const errorMessage = err instanceof Error ? err.message : "Failed to upload profile photo.";
      setMessage({ type: "error", text: errorMessage });
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
    } catch (err) {
      // 1. Capture error on profile image deletion failure
      // 2. Set error notification with fallback text
      const errorMessage = err instanceof Error ? err.message : "Failed to remove profile photo.";
      setMessage({ type: "error", text: errorMessage });
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

      <div className="pt-1 flex items-center justify-between border-b border-neutral-100 pb-6">
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

      {/* Danger Zone: Account Deletion */}
      <div className="pt-4">
        <h3 className="text-sm font-semibold text-red-600">Danger Zone</h3>
        <p className="text-xs text-neutral-400 mt-1 mb-4">
          Permanently delete your account and all of your data. This action is irreversible.
        </p>
        <button
          type="button"
          onClick={handleOpenDeleteModal}
          disabled={fetchingStatus}
          className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 hover:text-red-700 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {fetchingStatus ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Preparing...
            </>
          ) : (
            <>
              <Trash2 className="w-3.5 h-3.5" />
              Delete Account
            </>
          )}
        </button>
      </div>

      {/* Delete Account Modal Dialog */}
      {showDeleteModal && deleteStatus && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div
            className="bg-white rounded-xl border border-neutral-200 max-w-lg w-full p-6 space-y-6 shadow-xl animate-slide-up max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />
                Delete Account
              </h3>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Error notifications for request issues */}
            {deleteRequestError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs">
                {deleteRequestError}
              </div>
            )}

            {deleteRequestSuccess ? (
              <div className="space-y-4 py-4 text-center">
                <div className="w-12 h-12 rounded-full bg-green-50 mx-auto flex items-center justify-center">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-neutral-800">Verification Link Sent</h4>
                  <p className="text-xs text-neutral-500 max-w-xs mx-auto leading-relaxed">
                    A confirmation link has been sent to <span className="font-semibold">{profile.email}</span>. 
                    Please click the link within 30 minutes to permanently delete your account.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    className="btn-primary text-xs py-1.5 px-4"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : deleteStatus.isSoleGlobalOwner ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-red-50 border border-red-100 flex gap-3 text-red-700">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold">Action Required</p>
                    <p className="text-xs leading-relaxed">
                      You are the sole system Owner. You cannot delete your account. 
                      Please promote another user to the Owner role in the Admin Panel before requesting account deletion.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    className="px-4 py-2 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 rounded-lg text-xs font-semibold transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRequestDeletion} className="space-y-5">
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Before deleting your account, please review the requirements for your workspaces:
                </p>

                {/* Display workspaces scheduled for automatic deletion */}
                {deleteStatus.deletedWorkspaces.length > 0 && (
                  <div className="p-3.5 bg-amber-50/50 border border-amber-100 rounded-lg space-y-1">
                    <h4 className="text-xs font-semibold text-amber-800">Workspaces to be Deleted</h4>
                    <p className="text-[11px] text-amber-600 leading-normal">
                      The following workspaces have no other members and will be permanently deleted:
                    </p>
                    <ul className="list-disc pl-4 text-[11px] text-amber-700 space-y-0.5 mt-1 font-medium">
                      {deleteStatus.deletedWorkspaces.map((ws) => (
                        <li key={ws.id}>{ws.name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Transfer workspace ownership form inputs */}
                {deleteStatus.transferWorkspaces.length > 0 && (
                  <div className="space-y-3.5">
                    <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg">
                      <h4 className="text-xs font-semibold text-neutral-700">Transfer Workspace Ownership</h4>
                      <p className="text-[11px] text-neutral-500 leading-normal mt-0.5">
                        You are the Owner of the following workspaces. Select another member to receive ownership:
                      </p>
                    </div>

                    <div className="space-y-3">
                      {deleteStatus.transferWorkspaces.map((ws) => (
                        <div key={ws.id} className="space-y-1">
                          <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                            New Owner for: {ws.name}
                          </label>
                          <select
                            value={transfers[ws.id] || ""}
                            onChange={(e) => {
                              const targetVal = e.target.value;
                              setTransfers((prev) => ({ ...prev, [ws.id]: targetVal }));
                            }}
                            className="glass-select text-xs py-1.5 h-9"
                            required
                          >
                            <option value="">Select a member...</option>
                            {ws.members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.full_name || m.email?.split("@")[0]} ({m.email})
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Double confirmation checkbox */}
                <div className="flex items-start gap-2.5 pt-2">
                  <input
                    type="checkbox"
                    id="understand-checkbox"
                    checked={understood}
                    onChange={(e) => setUnderstood(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-500/20"
                    required
                  />
                  <label htmlFor="understand-checkbox" className="text-xs text-neutral-600 leading-normal select-none">
                    I understand that deleting my account is permanent, irreversible, and will delete all my user data.
                  </label>
                </div>

                {/* Cancel or confirm submission */}
                <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    className="px-4 py-2 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 rounded-lg text-xs font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deleteRequestLoading || !understood}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                  >
                    {deleteRequestLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Requesting...
                      </>
                    ) : (
                      "Confirm and Send Link"
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
