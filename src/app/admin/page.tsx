"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Check, Copy, RefreshCw, Filter, Key, Users, Calendar, Briefcase } from "lucide-react";

type AttendanceWorkspace = { id: string; name: string };

type AttendanceLogEntry = {
  id: string;
  date: string;
  status: string;
  user: {
    full_name: string | null;
    email: string | null;
    memberships: { workspace: AttendanceWorkspace }[];
  };
};

type AdminUserWorkspace = {
  workspace: { id: string; name: string };
  role: string;
};

type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  memberships: AdminUserWorkspace[];
};

type AdminWorkspace = {
  id: string;
  name: string;
  invite_code: string | null;
  _count: { members: number };
};

const ROLES = ["Owner", "Admin", "Manager", "Member", "Guest"] as const;

// Role label colors tuned for legibility on dark backgrounds
const ROLE_COLOR: Record<string, string> = {
  Owner:   "text-violet-400",
  Admin:   "text-[#e06b6b]",
  Manager: "text-emerald-400",
  Member:  "text-blue-400",
  Guest:   "text-zinc-500",
};

// Attendance badge styles for the dark admin layout
const ATTENDANCE_STATUS_STYLE: Record<string, string> = {
  Present: "bg-green-950/50 text-green-400 border border-green-900/40",
  Late:    "bg-amber-950/50 text-amber-400 border border-amber-900/40",
  Absent:  "bg-red-950/50  text-red-400   border border-red-900/40",
};

// Pending role change — stored when admin picks a new role from the dropdown.
// The actual API call only fires after the confirmation modal is accepted.
type PendingRoleChange = {
  userId: string;
  userName: string;
  currentRole: string;
  newRole: string;
};

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Workspace filter for the users table: empty string means "all workspaces"
  const [wsFilter, setWsFilter] = useState("");
  // Confirmation modal: set when admin picks a new role; cleared on confirm or cancel
  const [pendingRole, setPendingRole] = useState<PendingRoleChange | null>(null);

  // Attendance logs state
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLogEntry[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceWsFilter, setAttendanceWsFilter] = useState("");
  const [attendanceDateFilter, setAttendanceDateFilter] = useState("");

  // Tab state
  const [activeTab, setActiveTab] = useState<"users" | "attendance" | "workspaces" | "permissions">("users");

  // Access Control overrides states
  const [selectedWs, setSelectedWs] = useState("");
  const [permissionsOverrides, setPermissionsOverrides] = useState<any[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [updatingPermission, setUpdatingPermission] = useState<string | null>(null);

  const fetchPermissionsOverrides = useCallback(async (wsId: string) => {
    if (!wsId) return;
    setPermissionsLoading(true);
    try {
      const res = await fetch(`/api/admin/permissions?workspaceId=${wsId}`);
      if (res.ok) {
        setPermissionsOverrides(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch overrides:", err);
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedWs && activeTab === "permissions") {
      fetchPermissionsOverrides(selectedWs);
    }
  }, [selectedWs, activeTab, fetchPermissionsOverrides]);

  useEffect(() => {
    if (workspaces.length > 0 && !selectedWs) {
      setSelectedWs(workspaces[0].id);
    }
  }, [workspaces, selectedWs]);

  const handleUpdateOverride = async (userId: string, permission: string, value: boolean | null) => {
    if (!selectedWs) return;
    const updateKey = `${userId}-${permission}`;
    setUpdatingPermission(updateKey);
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWs,
          userId,
          permission,
          allowed: value,
        }),
      });
      if (res.ok) {
        await fetchPermissionsOverrides(selectedWs);
      } else {
        alert("Failed to update permission override");
      }
    } catch (err) {
      console.error("Error updating override:", err);
    } finally {
      setUpdatingPermission(null);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, wsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/workspaces"),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (wsRes.ok) setWorkspaces(await wsRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch attendance logs filtered by workspace and/or date
  const fetchAttendanceLogs = useCallback(async (wsId: string, date: string) => {
    setAttendanceLoading(true);
    try {
      const params = new URLSearchParams();
      if (wsId) params.set("workspaceId", wsId);
      if (date) params.set("date", date);
      const res = await fetch(`/api/admin/attendance?${params.toString()}`);
      if (res.ok) setAttendanceLogs(await res.json());
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-fetch attendance whenever either attendance filter changes
  useEffect(() => {
    fetchAttendanceLogs(attendanceWsFilter, attendanceDateFilter);
  }, [fetchAttendanceLogs, attendanceWsFilter, attendanceDateFilter]);

  const updateRole = async (userId: string, role: string) => {
    setSaving(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
        setSaved(userId);
        setTimeout(() => setSaved(null), 2000);
      }
    } finally {
      setSaving(null);
    }
  };

  // Called when the admin selects a new role from the dropdown.
  // Stores the pending change for confirmation — does NOT update the DB yet.
  const handleRoleSelect = (user: AdminUser, newRole: string) => {
    if (newRole === user.role) return;
    setPendingRole({
      userId: user.id,
      userName: user.full_name || user.email || user.id,
      currentRole: user.role,
      newRole,
    });
  };

  const confirmRoleChange = async () => {
    if (!pendingRole) return;
    await updateRole(pendingRole.userId, pendingRole.newRole);
    setPendingRole(null);
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
      </div>
    );
  }

  // Filter users by the selected workspace
  const filteredUsers = wsFilter
    ? users.filter((u) => u.memberships.some((m) => m.workspace.id === wsFilter))
    : users;

  const ownerCount = users.filter((u) => u.role === "Owner").length;

  // Shared class strings to keep table markup consistent
  const tableWrap  = "bg-[#111115] rounded-xl border border-zinc-800/50 overflow-hidden";
  const theadRow   = "border-b border-zinc-800/60 bg-zinc-900/50";
  const th         = "text-left px-5 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide";
  const tbodyDiv   = "divide-y divide-zinc-800/30";
  const tr         = "hover:bg-white/[0.025] transition-colors";
  const tdPrimary  = "px-5 py-3 text-zinc-200 font-medium";
  const tdSecond   = "px-5 py-3 text-zinc-400";
  const tdMuted    = "px-5 py-3 text-zinc-600 text-xs";
  const filterInput =
    "text-xs border border-zinc-700/60 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-[#e06b6b]/20 focus:border-[#e06b6b] outline-none bg-zinc-900/80 text-zinc-300 placeholder:text-zinc-600";

  return (
    <>
    <div className="space-y-8">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">Admin Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Manage user roles and workspace access.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-3 py-1.5 rounded-lg border border-zinc-700/50 hover:border-zinc-600 bg-zinc-900/80"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Users",  value: users.length },
          { label: "Workspaces",   value: workspaces.length },
          { label: "Owners",       value: ownerCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-[#111115] rounded-xl border border-zinc-800/50 px-5 py-4"
          >
            <div className="text-xs text-zinc-500 mb-1 font-medium">{stat.label}</div>
            <div className="text-2xl font-bold text-neutral-100">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800/80 gap-6">
        {[
          { id: "users", label: "Users", icon: Users },
          { id: "attendance", label: "Attendance Logs", icon: Calendar },
          { id: "workspaces", label: "Workspaces", icon: Briefcase },
          { id: "permissions", label: "Access Control", icon: Key },
        ].map((tab) => {
          const Icon = tab.icon;
          const isAct = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 pb-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                isAct
                  ? "border-[#e06b6b] text-neutral-100 font-bold"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
              Users
            </h2>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-zinc-600" />
              <select
                value={wsFilter}
                onChange={(e) => setWsFilter(e.target.value)}
                className={filterInput}
              >
                <option value="">All workspaces</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={tableWrap}>
            <table className="w-full text-sm">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Email</th>
                  <th className={th}>Name</th>
                  <th className={th}>Global Role</th>
                  <th className={th}>Workspaces</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className={tbodyDiv}>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className={tr}>
                    <td className={tdPrimary}>{user.email ?? "—"}</td>
                    <td className={tdSecond}>{user.full_name ?? "—"}</td>
                    <td className="px-5 py-3">
                      {/* Selecting a new role opens a confirmation modal before committing */}
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleSelect(user, e.target.value)}
                        disabled={saving === user.id}
                        className={`text-sm border border-zinc-700/60 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-[#e06b6b]/20 focus:border-[#e06b6b] outline-none bg-zinc-900 disabled:opacity-50 font-medium cursor-pointer ${ROLE_COLOR[user.role] ?? "text-zinc-300"}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      {user.memberships.length === 0 ? (
                        <span className={tdMuted.replace("px-5 py-3 ", "")}>No workspaces</span>
                      ) : (
                        // gap-2 + consistent py-1 padding across all workspace badges
                        <div className="flex flex-wrap gap-2">
                          {user.memberships.map((m) => (
                            <span
                              key={m.workspace.id}
                              className="inline-flex items-center gap-1.5 text-[10px] bg-zinc-800/60 text-zinc-300 px-2.5 py-1 rounded-full"
                              title={`${m.workspace.name} (${m.role})`}
                            >
                              {m.workspace.name}
                              <span className={`font-bold ${ROLE_COLOR[m.role] ?? "text-zinc-400"}`}>
                                {m.role[0]}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 w-8">
                      {saving === user.id && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
                      )}
                      {saved === user.id && (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-zinc-600 text-sm">
                      {wsFilter ? "No users in this workspace." : "No users found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attendance Logs Tab */}
      {activeTab === "attendance" && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
              Attendance Logs
            </h2>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-zinc-600" />
              <input
                type="date"
                value={attendanceDateFilter}
                onChange={(e) => setAttendanceDateFilter(e.target.value)}
                className={filterInput}
              />
              <select
                value={attendanceWsFilter}
                onChange={(e) => setAttendanceWsFilter(e.target.value)}
                className={filterInput}
              >
                <option value="">All workspaces</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
              {attendanceDateFilter && (
                <button
                  onClick={() => setAttendanceDateFilter("")}
                  className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1.5 rounded-lg border border-zinc-700/50 bg-zinc-900/80 transition-colors cursor-pointer"
                >
                  Clear date
                </button>
              )}
            </div>
          </div>
          <div className={tableWrap}>
            <table className="w-full text-sm">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Date</th>
                  <th className={th}>Name</th>
                  <th className={th}>Email</th>
                  <th className={th}>Workspace</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className={tbodyDiv}>
                {attendanceLoading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center">
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-600 mx-auto" />
                    </td>
                  </tr>
                ) : attendanceLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-zinc-600 text-sm">
                      No attendance records found.
                    </td>
                  </tr>
                ) : (
                  attendanceLogs.map((log) => {
                    // Prisma returns a full ISO string; parse it directly — do NOT
                    // append "T00:00:00Z" since the string already carries that suffix.
                    const dateLabel = new Date(log.date).toLocaleDateString("en-US", {
                      timeZone: "UTC",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    });

                    // Workspace names for this user; narrow to the filtered workspace when set
                    const workspaceNames = log.user.memberships
                      .map((m) => m.workspace.name)
                      .filter((name) => !attendanceWsFilter || log.user.memberships.some((m) => m.workspace.id === attendanceWsFilter));

                    return (
                      <tr key={log.id} className={tr}>
                        <td className={tdPrimary}>{dateLabel}</td>
                        <td className={tdSecond}>{log.user.full_name ?? "—"}</td>
                        <td className={tdSecond + " text-xs"}>{log.user.email ?? "—"}</td>
                        <td className="px-5 py-3">
                          {workspaceNames.length === 0 ? (
                            <span className="text-zinc-600 text-xs">None</span>
                          ) : (
                            // gap-2 + py-1 for uniform badge height across all rows
                            <div className="flex flex-wrap gap-2">
                              {workspaceNames.map((name) => (
                                <span
                                  key={name}
                                  className="text-[10px] bg-zinc-800/60 text-zinc-300 px-2.5 py-1 rounded-full"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                              ATTENDANCE_STATUS_STYLE[log.status] ?? "bg-zinc-800/60 text-zinc-400"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Workspaces Tab */}
      {activeTab === "workspaces" && (
        <div className="space-y-4 animate-fade-in">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Workspaces
          </h2>
          <div className={tableWrap}>
            <table className="w-full text-sm">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Name</th>
                  <th className={th}>Members</th>
                  <th className={th}>Invite Code</th>
                </tr>
              </thead>
              <tbody className={tbodyDiv}>
                {workspaces.map((ws) => (
                  <tr key={ws.id} className={tr}>
                    <td className={tdPrimary}>{ws.name}</td>
                    <td className={tdSecond}>{ws._count.members}</td>
                    <td className="px-5 py-3">
                      {ws.invite_code ? (
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-zinc-900/80 border border-zinc-800/50 px-2.5 py-1 rounded-md font-mono text-zinc-400 max-w-[220px] truncate block">
                            {ws.invite_code}
                          </code>
                          <button
                            onClick={() => copyCode(ws.invite_code!, ws.id)}
                            title="Copy invite code"
                            className="flex-shrink-0 p-1.5 rounded-md hover:bg-zinc-800/60 transition-colors text-zinc-500 hover:text-zinc-200 cursor-pointer"
                          >
                            {copied === ws.id ? (
                              <Check className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-zinc-600 text-xs">No code generated</span>
                      )}
                    </td>
                  </tr>
                ))}
                {workspaces.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-zinc-600 text-sm">
                      No workspaces yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Access Control (Permissions) Tab */}
      {activeTab === "permissions" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#111115] border border-zinc-800/50 rounded-xl p-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                <Key size={16} className="text-[#e06b6b]" />
                Access Control &amp; Overrides
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Grant or revoke specific permission overrides for workspace members.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-zinc-500" />
              <select
                value={selectedWs}
                onChange={(e) => setSelectedWs(e.target.value)}
                className={filterInput}
              >
                <option value="">Select a workspace...</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedWs ? (
            permissionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-[#e06b6b]" />
              </div>
            ) : (
              <div className={tableWrap + " overflow-x-auto"}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className={theadRow}>
                      <th className={th + " min-w-[150px]"}>Member</th>
                      <th className={th}>Workspace Role</th>
                      {[
                        { label: "Create Task", key: "task:create" },
                        { label: "Edit Title", key: "task:edit_title" },
                        { label: "Edit Deadline", key: "task:edit_deadline" },
                        { label: "Edit Metadata", key: "task:edit_metadata" },
                        { label: "Delete Task", key: "task:delete" },
                        { label: "Manage Announcements", key: "announcement:manage" },
                        { label: "View Payouts", key: "finance:view" },
                      ].map((p) => (
                        <th key={p.key} className="px-4 py-3 text-center font-medium text-zinc-400 uppercase tracking-wider text-[9px] w-32">
                          {p.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={tbodyDiv}>
                    {(() => {
                      const wsMembers = users.filter((u) =>
                        u.memberships.some((m) => m.workspace.id === selectedWs)
                      );
                      if (wsMembers.length === 0) {
                        return (
                          <tr>
                            <td colSpan={9} className="px-5 py-8 text-center text-zinc-650 text-sm">
                              No members in this workspace yet.
                            </td>
                          </tr>
                        );
                      }
                      return wsMembers.map((m) => {
                        const wsRole = m.memberships.find((mem) => mem.workspace.id === selectedWs)?.role || "Member";
                        return (
                          <tr key={m.id} className={tr}>
                            <td className="px-5 py-3.5">
                              <div className="font-semibold text-zinc-200">{m.full_name || "User"}</div>
                              <div className="text-[10px] text-zinc-500 mt-0.5">{m.email}</div>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-805/40 ${ROLE_COLOR[wsRole] ?? "text-zinc-400"}`}>
                                {wsRole}
                              </span>
                            </td>
                            {[
                              "task:create",
                              "task:edit_title",
                              "task:edit_deadline",
                              "task:edit_metadata",
                              "task:delete",
                              "announcement:manage",
                              "finance:view",
                            ].map((perm) => {
                              const override = permissionsOverrides.find(
                                (o) => o.user_id === m.id && o.permission === perm
                              );
                              const currentVal = override === undefined ? "default" : override.allowed ? "allow" : "deny";
                              const isUpdating = updatingPermission === `${m.id}-${perm}`;

                              return (
                                <td key={perm} className="px-4 py-3 text-center">
                                  {isUpdating ? (
                                    <div className="flex items-center justify-center h-7">
                                      <Loader2 className="w-3 h-3 animate-spin text-[#e06b6b]" />
                                    </div>
                                  ) : (
                                    <select
                                      value={currentVal}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const dbVal = val === "default" ? null : val === "allow";
                                        handleUpdateOverride(m.id, perm, dbVal);
                                      }}
                                      className={`text-[10px] font-semibold border rounded px-1.5 py-1 focus:ring-1 focus:ring-[#e06b6b]/20 outline-none bg-zinc-900 cursor-pointer ${
                                        currentVal === "allow"
                                          ? "text-green-400 border-green-90/50 bg-green-950/20"
                                          : currentVal === "deny"
                                          ? "text-red-400 border-red-90/50 bg-red-950/20"
                                          : "text-zinc-500 border-zinc-800 bg-zinc-950/30"
                                      }`}
                                    >
                                      <option value="default" className="text-zinc-500">Default</option>
                                      <option value="allow" className="text-green-400 font-semibold">Forced Allow</option>
                                      <option value="deny" className="text-red-400 font-semibold">Forced Deny</option>
                                    </select>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="py-12 border border-dashed border-zinc-800 rounded-xl text-center text-zinc-500 text-sm">
              Please select a workspace to configure access controls.
            </div>
          )}
        </div>
      )}

    </div>

      {/* Role change confirmation modal — rendered outside the scrollable content */}
      {pendingRole && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#111115] rounded-xl border border-zinc-800/60 shadow-2xl w-full max-w-sm p-6 animate-fade-in">
            <h3 className="text-sm font-semibold text-neutral-100 mb-2">Confirm Role Change</h3>
            <p className="text-sm text-zinc-400 mb-1">
              You are about to change{" "}
              <span className="font-medium text-zinc-200">{pendingRole.userName}</span>
            </p>
            <p className="text-sm text-zinc-400 mb-5">
              from{" "}
              <span className={`font-semibold ${ROLE_COLOR[pendingRole.currentRole] ?? "text-zinc-300"}`}>
                {pendingRole.currentRole}
              </span>{" "}
              to{" "}
              <span className={`font-semibold ${ROLE_COLOR[pendingRole.newRole] ?? "text-zinc-300"}`}>
                {pendingRole.newRole}
              </span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmRoleChange}
                disabled={saving === pendingRole.userId}
                className="flex-1 py-2 rounded-lg bg-[#7b2c51] text-white text-sm font-semibold hover:bg-[#621f3e] transition-colors disabled:opacity-50"
              >
                {saving === pendingRole.userId ? "Saving..." : "Confirm"}
              </button>
              <button
                onClick={() => setPendingRole(null)}
                disabled={saving === pendingRole.userId}
                className="flex-1 py-2 rounded-lg border border-zinc-700 text-sm font-medium text-zinc-300 hover:bg-zinc-800/60 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
