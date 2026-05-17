"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Check, Copy, RefreshCw, Filter } from "lucide-react";

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

const ROLES = ["Owner", "Admin", "Member", "Guest"] as const;

const ROLE_COLOR: Record<string, string> = {
  Owner: "text-violet-600",
  Admin: "text-[#7b2c51]",
  Member: "text-blue-600",
  Guest: "text-gray-400",
};

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Workspace filter: empty string means "all workspaces"
  const [wsFilter, setWsFilter] = useState("");

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

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      </div>
    );
  }

  // Filter users by the selected workspace
  const filteredUsers = wsFilter
    ? users.filter((u) => u.memberships.some((m) => m.workspace.id === wsFilter))
    : users;

  const ownerCount = users.filter((u) => u.role === "Owner").length;

  return (
    <div className="space-y-8">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage user roles and workspace access.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Users", value: users.length },
          { label: "Workspaces", value: workspaces.length },
          { label: "Owners", value: ownerCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-gray-200 px-5 py-4"
          >
            <div className="text-xs text-gray-400 mb-1 font-medium">{stat.label}</div>
            <div className="text-2xl font-bold text-gray-800">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Users
          </h2>
          {/* Workspace filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={wsFilter}
              onChange={(e) => setWsFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-[#7b2c51]/20 focus:border-[#7b2c51] outline-none bg-white text-gray-600"
            >
              <option value="">All workspaces</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Email
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Global Role
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Workspaces
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3 text-gray-700 font-medium">{user.email ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-400">{user.full_name ?? "—"}</td>
                  <td className="px-5 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => updateRole(user.id, e.target.value)}
                      disabled={saving === user.id}
                      className={`text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-[#7b2c51]/20 focus:border-[#7b2c51] outline-none bg-white disabled:opacity-50 font-medium ${ROLE_COLOR[user.role] ?? "text-gray-600"}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    {user.memberships.length === 0 ? (
                      <span className="text-gray-300 text-xs">No workspaces</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {user.memberships.map((m) => (
                          <span
                            key={m.workspace.id}
                            className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                            title={`${m.workspace.name} (${m.role})`}
                          >
                            {m.workspace.name}
                            <span className={`font-semibold ${ROLE_COLOR[m.role] ?? "text-gray-500"}`}>
                              {m.role[0]}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 w-8">
                    {saving === user.id && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-300" />
                    )}
                    {saved === user.id && (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-300 text-sm">
                    {wsFilter ? "No users in this workspace." : "No users found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workspaces table */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Workspaces
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Members
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Invite Code
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {workspaces.map((ws) => (
                <tr key={ws.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-700">{ws.name}</td>
                  <td className="px-5 py-3 text-gray-400">{ws._count.members}</td>
                  <td className="px-5 py-3">
                    {ws.invite_code ? (
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-gray-100 px-2.5 py-1 rounded-md font-mono text-gray-500 max-w-[220px] truncate block">
                          {ws.invite_code}
                        </code>
                        <button
                          onClick={() => copyCode(ws.invite_code!, ws.id)}
                          title="Copy invite code"
                          className="flex-shrink-0 p-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                        >
                          {copied === ws.id ? (
                            <Check className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">No code generated</span>
                    )}
                  </td>
                </tr>
              ))}
              {workspaces.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-gray-300 text-sm">
                    No workspaces yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
