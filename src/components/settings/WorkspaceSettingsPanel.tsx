"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Invitation } from "@/lib/types";
import {
  Loader2,
  Copy,
  Check,
  Trash2,
  Plus,
  UserX,
  RefreshCw,
  Megaphone,
  X,
} from "lucide-react";
import UserAvatar from "@/components/common/UserAvatar";

type WorkspaceMemberRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;            // global role
  workspace_role: string;  // role within this workspace
  image?: string | null;
};

type AnnouncementRow = {
  id: string;
  content: string;
  type: string;
  active: boolean;
  created_at: string;
  expires_at: string | null;
  user: { full_name: string | null; image: string | null };
};

const ROLE_COLOR: Record<string, string> = {
  Owner: "text-violet-600 bg-violet-50",
  Admin: "text-[#7b2c51] bg-[#7b2c51]/10",
  Member: "text-blue-600 bg-blue-50",
  Guest: "text-gray-400 bg-gray-50",
};

const ANN_TYPE_LABEL: Record<string, string> = {
  info: "Info",
  warning: "Warning",
  urgent: "Urgent",
};

const ANN_TYPE_CLASS: Record<string, string> = {
  info: "bg-blue-50 text-blue-700",
  warning: "bg-amber-50 text-amber-700",
  urgent: "bg-red-50 text-red-700",
};

export default function WorkspaceSettingsPanel() {
  const { activeWorkspace, isWorkspaceAdmin, refreshWorkspaces } = useWorkspace();
  const { user } = useAuth();

  // Basic info form state
  const [wsName, setWsName] = useState("");
  const [wsDesc, setWsDesc] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Members list state
  const [members, setMembers] = useState<WorkspaceMemberRow[]>([]);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  // Invitations state
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [deletingInvite, setDeletingInvite] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Announcements state
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [announcementContent, setAnnouncementContent] = useState("");
  const [announcementType, setAnnouncementType] = useState("info");
  const [creatingAnnouncement, setCreatingAnnouncement] = useState(false);
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);
    try {
      const [membersRes, invRes] = await Promise.all([
        fetch(`/api/members?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/invitations?workspaceId=${activeWorkspace.id}`),
      ]);

      if (membersRes.ok) {
        const raw = await membersRes.json();
        // members API returns plain user objects; we need to get workspace roles
        // Re-fetch with role info via invitations-adjacent approach
        setMembers(raw);
      }
      if (invRes.ok) setInvitations(await invRes.json());
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace?.id]);

  // Fetch announcements for this workspace
  const fetchAnnouncements = useCallback(async () => {
    if (!activeWorkspace?.id) {
      setAnnouncements([]);
      return;
    }
    try {
      const res = await fetch(`/api/announcements?workspaceId=${activeWorkspace.id}`);
      if (res.ok) {
        const data: AnnouncementRow[] = await res.json();
        setAnnouncements(data);
      }
    } catch {
      // Non-critical
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (activeWorkspace) {
      setWsName(activeWorkspace.name);
      setWsDesc(activeWorkspace.description ?? "");
    }
    setAnnouncements([]);
    fetchData();
    fetchAnnouncements();
  }, [activeWorkspace?.id, fetchData, fetchAnnouncements]);

  const handleSaveInfo = async () => {
    if (!activeWorkspace?.id || !wsName.trim()) return;
    setSavingInfo(true);
    setInfoMessage(null);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: wsName.trim(), description: wsDesc.trim() }),
      });
      if (res.ok) {
        setInfoMessage({ type: "success", text: "Workspace updated." });
        await refreshWorkspaces();
      } else {
        const d = await res.json();
        setInfoMessage({ type: "error", text: d.error || "Failed to update workspace." });
      }
    } catch {
      setInfoMessage({ type: "error", text: "Something went wrong." });
    } finally {
      setSavingInfo(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!activeWorkspace?.id) return;
    setRemovingMember(targetUserId);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/members/${targetUserId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== targetUserId));
      }
    } finally {
      setRemovingMember(null);
    }
  };

  const handleCreateInvitation = async () => {
    if (!activeWorkspace?.id) return;
    setCreatingInvite(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: activeWorkspace.id }),
      });
      if (res.ok) {
        const inv = await res.json();
        setInvitations((prev) => [inv, ...prev]);
      }
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleDeleteInvite = async (id: string) => {
    setDeletingInvite(id);
    try {
      const res = await fetch(`/api/invitations/${id}`, { method: "DELETE" });
      if (res.ok) setInvitations((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setDeletingInvite(null);
    }
  };

  const handleApproveReject = async (id: string, action: "approve" | "reject") => {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/invitations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setApprovingId(null);
    }
  };

  // Create a new announcement for this workspace
  const handleCreateAnnouncement = async () => {
    if (!activeWorkspace?.id || !announcementContent.trim()) return;
    setCreatingAnnouncement(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: announcementContent.trim(),
          type: announcementType,
          workspaceId: activeWorkspace.id,
        }),
      });
      if (res.ok) {
        setAnnouncementContent("");
        setAnnouncementType("info");
        await fetchAnnouncements();
      }
    } catch {
      // Non-critical
    } finally {
      setCreatingAnnouncement(false);
    }
  };

  // Deactivate an announcement
  const handleDeleteAnnouncement = async (id: string) => {
    setDeletingAnnouncementId(id);
    try {
      const res = await fetch(`/api/announcements?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      // Non-critical
    } finally {
      setDeletingAnnouncementId(null);
    }
  };

  const statusLabel: Record<string, string> = {
    ACTIVE: "Active",
    PENDING_APPROVAL: "Pending",
    USED: "Used",
    EXPIRED: "Expired",
  };

  const statusClass: Record<string, string> = {
    ACTIVE: "bg-green-50 text-green-700",
    PENDING_APPROVAL: "bg-amber-50 text-amber-700",
    USED: "bg-gray-100 text-gray-400",
    EXPIRED: "bg-red-50 text-red-400",
  };

  // Invitations in the approval queue: PENDING_APPROVAL with a waiting claimer
  const pendingRequests = invitations.filter(
    (i) => i.status === "PENDING_APPROVAL" && i.claimer_id
  );

  // All other invitations for the main list (exclude ones with claimers waiting — shown in queue)
  const activeInvitations = invitations.filter(
    (i) => !(i.status === "PENDING_APPROVAL" && i.claimer_id)
  );

  if (!activeWorkspace) {
    return (
      <div className="text-sm text-neutral-400 py-8 text-center">
        Select a workspace from the sidebar to manage its settings.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-neutral-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading workspace data...
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Basic info */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-800">Workspace Info</h2>
            {!isWorkspaceAdmin && (
              <p className="text-xs text-neutral-400 mt-0.5">Read-only — only workspace Admins can edit.</p>
            )}
          </div>
          {isWorkspaceAdmin && (
            <button
              onClick={handleSaveInfo}
              disabled={savingInfo || !wsName.trim()}
              className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5 disabled:opacity-50"
            >
              {savingInfo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Save
            </button>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
            Name
          </label>
          <input
            type="text"
            value={wsName}
            onChange={(e) => { setWsName(e.target.value); setInfoMessage(null); }}
            disabled={!isWorkspaceAdmin}
            className="glass-input text-sm disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
            Description
          </label>
          <input
            type="text"
            value={wsDesc}
            onChange={(e) => setWsDesc(e.target.value)}
            disabled={!isWorkspaceAdmin}
            placeholder="What is this workspace for?"
            className="glass-input text-sm disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed"
          />
        </div>

        {infoMessage && (
          <div className={`rounded-lg px-4 py-3 text-xs ${
            infoMessage.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-600"
          }`}>
            {infoMessage.text}
          </div>
        )}
      </div>

      {/* Announcements — Admin/Owner only */}
      {isWorkspaceAdmin && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <Megaphone size={16} className="text-neutral-500" />
              <h2 className="text-sm font-semibold text-neutral-800">Announcements</h2>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Create announcements that appear at the top of the dashboard for all workspace members.
            </p>
          </div>

          {/* Create announcement form */}
          <div className="px-6 py-4 border-b border-neutral-50 bg-neutral-50/50">
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                  Message
                </label>
                <input
                  type="text"
                  value={announcementContent}
                  onChange={(e) => setAnnouncementContent(e.target.value)}
                  placeholder="Write your announcement here..."
                  className="glass-input text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter" && announcementContent.trim()) handleCreateAnnouncement(); }}
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                    Type
                  </label>
                  <select
                    value={announcementType}
                    onChange={(e) => setAnnouncementType(e.target.value)}
                    className="glass-select text-xs py-1.5 h-9"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <button
                  onClick={handleCreateAnnouncement}
                  disabled={creatingAnnouncement || !announcementContent.trim()}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {creatingAnnouncement ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Megaphone className="w-3 h-3" />
                  )}
                  Post
                </button>
              </div>
            </div>
          </div>

          {/* Active announcements list */}
          <div className="divide-y divide-neutral-50">
            {announcements.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-neutral-300">
                No active announcements for this workspace.
              </div>
            ) : (
              announcements.map((ann) => (
                <div key={ann.id} className="flex items-center justify-between px-6 py-3 gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${ANN_TYPE_CLASS[ann.type] ?? "bg-gray-50 text-gray-400"}`}>
                      {ANN_TYPE_LABEL[ann.type] ?? ann.type}
                    </span>
                    <p className="text-xs text-neutral-700 truncate">{ann.content}</p>
                    <span className="text-[10px] text-neutral-400 shrink-0">
                      {ann.user?.full_name ?? "Unknown"}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteAnnouncement(ann.id)}
                    disabled={deletingAnnouncementId === ann.id}
                    title="Remove announcement"
                    className="p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 shrink-0"
                  >
                    {deletingAnnouncementId === ann.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Members */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-800">Members</h2>
          <button
            onClick={fetchData}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="divide-y divide-neutral-50">
          {members.map((member) => {
            const isSelf = member.id === user?.id;
            // Owners can only be removed by other Owners — hide the button for non-Owners
            const wsRole = member.workspace_role || "Member";
            const callerIsOwner = activeWorkspace?.member_role === "Owner";
            const canRemove = isWorkspaceAdmin && !isSelf && (wsRole !== "Owner" || callerIsOwner);
            return (
              <div key={member.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    fullName={member.full_name}
                    image={member.image}
                    size={28}
                    className="rounded-md"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-700 truncate">
                      {member.full_name || "Unnamed"}
                      {isSelf && <span className="ml-1.5 text-[10px] text-neutral-400">(you)</span>}
                    </p>
                    <p className="text-xs text-neutral-400 truncate">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLOR[wsRole] ?? "text-gray-500 bg-gray-50"}`}>
                    {wsRole}
                  </span>
                  {canRemove && (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      disabled={removingMember === member.id}
                      title="Remove from workspace"
                      className="p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      {removingMember === member.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserX className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {members.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-neutral-300">No members yet.</div>
          )}
        </div>
      </div>

      {/* Invitations */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-800">Invitations</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {isWorkspaceAdmin
                ? "Admin-generated codes allow instant joining. Your role level is applied automatically."
                : "Member-generated codes require admin approval before the invitee can join."}
            </p>
          </div>
          <button
            onClick={handleCreateInvitation}
            disabled={creatingInvite}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            {creatingInvite ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
            Create Invite
          </button>
        </div>

        <div className="divide-y divide-neutral-50">
          {activeInvitations.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between px-6 py-3 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <code className="text-xs font-mono font-semibold text-neutral-700 bg-neutral-100 px-2 py-1 rounded">
                  {inv.code}
                </code>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusClass[inv.status] ?? "bg-gray-50 text-gray-400"}`}>
                  {statusLabel[inv.status] ?? inv.status}
                </span>
                {inv.status === "PENDING_APPROVAL" && (
                  <span className="text-[10px] text-neutral-400">Awaiting admin approval</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {inv.status === "ACTIVE" && (
                  <button
                    onClick={() => handleCopyCode(inv.code)}
                    title="Copy code"
                    className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                  >
                    {copiedCode === inv.code ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
                {(inv.status === "ACTIVE" || inv.status === "PENDING_APPROVAL") &&
                  (inv.invited_by_id === user?.id || isWorkspaceAdmin) && (
                    <button
                      onClick={() => handleDeleteInvite(inv.id)}
                      disabled={deletingInvite === inv.id}
                      title="Cancel invitation"
                      className="p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      {deletingInvite === inv.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
              </div>
            </div>
          ))}
          {activeInvitations.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-neutral-300">
              No invitations yet. Click &quot;Create Invite&quot; to generate a code.
            </div>
          )}
        </div>
      </div>

      {/* Pending Requests — admin only, only shown when there are join attempts waiting */}
      {isWorkspaceAdmin && pendingRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/50">
            <h2 className="text-sm font-semibold text-amber-800">
              Pending Requests ({pendingRequests.length})
            </h2>
            <p className="text-xs text-amber-600 mt-0.5">
              These users have used a member-generated code and are waiting for your approval.
            </p>
          </div>
          <div className="divide-y divide-neutral-50">
            {pendingRequests.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-6 py-4 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-700">
                    {inv.claimer_email || "Unknown user"}
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Invited by {inv.invited_by?.full_name || inv.invited_by?.email || "a member"}
                    {inv.claimed_at &&
                      ` · Requested ${new Date(inv.claimed_at).toLocaleDateString()}`}
                  </p>
                  <p className="text-[10px] font-mono text-neutral-300 mt-0.5">
                    Code: {inv.code}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleApproveReject(inv.id, "approve")}
                    disabled={approvingId === inv.id}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {approvingId === inv.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Approve"
                    )}
                  </button>
                  <button
                    onClick={() => handleApproveReject(inv.id, "reject")}
                    disabled={approvingId === inv.id}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
