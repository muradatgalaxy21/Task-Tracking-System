"use client";

// Agency sidebar: logo, workspace switcher, nav, team list, notification bell, user footer.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { useState, useEffect, useRef, useCallback } from "react";
import UserAvatar from "@/components/common/UserAvatar";
import {
  LayoutDashboard,
  LogOut,
  CheckSquare,
  ChevronDown,
  Users,
  BarChart2,
  FolderOpen,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  X,
  Settings,
  MessageSquare,
  CalendarCheck,
  History,
  User,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  ownerOnly?: boolean;
}

// Modal mode: "join" shows invite code input; "create" shows workspace creation form
type WsModalMode = "join" | "create";

interface SidebarProps {
  isOpen?: boolean;   // mobile drawer open state
  onClose?: () => void; // called when mobile overlay or nav link is clicked
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { profile, user, isAdmin, isOwner, refreshKey, signOut } = useAuth();
  const { workspaces, activeWorkspace, setActiveWorkspace, refreshWorkspaces } = useWorkspace();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const wsDropdownRef = useRef<HTMLDivElement>(null);

  // Unified join/create workspace modal
  const [showWsModal, setShowWsModal] = useState(false);
  const [wsModalMode, setWsModalMode] = useState<WsModalMode>("join");
  // Join form
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinPending, setJoinPending] = useState(false);
  // Create form
  const [newWsName, setNewWsName] = useState("");
  const [newWsDesc, setNewWsDesc] = useState("");
  const [creatingWs, setCreatingWs] = useState(false);



  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
        setWsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const openWsModal = (mode: WsModalMode) => {
    setWsModalMode(mode);
    setJoinCode("");
    setJoinError("");
    setJoinPending(false);
    setNewWsName("");
    setNewWsDesc("");
    setWsDropdownOpen(false);
    setShowWsModal(true);
  };

  const closeWsModal = () => {
    setShowWsModal(false);
    setJoinCode("");
    setJoinError("");
    setJoinPending(false);
    setNewWsName("");
    setNewWsDesc("");
  };

  const handleJoinWorkspace = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError("");
    try {
      const res = await fetch("/api/invitations/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode.trim() }),
      });
      const data = await res.json();

      if (res.status === 202) {
        // Member-generated code — queued for admin approval
        setJoinPending(true);
        return;
      }

      if (!res.ok) {
        setJoinError(data.error || "Failed to join workspace");
        return;
      }

      await refreshWorkspaces();
      if (data.workspace) setActiveWorkspace(data.workspace);
      closeWsModal();
    } catch {
      setJoinError("Something went wrong. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim()) return;
    setCreatingWs(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWsName.trim(), description: newWsDesc.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create workspace");
      const created = await res.json();
      await refreshWorkspaces();
      setActiveWorkspace(created);
      closeWsModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setCreatingWs(false);
    }
  };



  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/dashboard",              icon: <LayoutDashboard size={17} /> },
    { label: "Tasks",     href: "/dashboard/tasks",        icon: <CheckSquare size={17} /> },
    // Chat is temporarily disabled. Undergoing maintenance.
    // { label: "Chat",      href: "/dashboard/chat",         icon: <MessageSquare size={17} /> },
    { label: "Projects",  href: "/dashboard/ledger",       icon: <FolderOpen size={17} /> },
    { label: "Team",      href: "/dashboard/attendance",   icon: <Users size={17} /> },
    { label: "My Profile", href: user ? `/dashboard/member/${user.id}` : "#", icon: <User size={17} /> },
    { label: "Reports",   href: "/dashboard/payout",       icon: <BarChart2 size={17} />, adminOnly: true },
    { label: "Month End", href: "/dashboard/month-end",    icon: <CalendarCheck size={17} />, ownerOnly: true },
    { label: "My History",href: "/dashboard/history",      icon: <History size={17} /> },
    { label: "Settings",  href: "/dashboard/settings",     icon: <Settings size={17} /> },
  ];

  return (
    <>
      {/* Mobile backdrop overlay — only visible when drawer is open on small screens */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar-base fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300 ${
          collapsed ? "w-[56px]" : "w-[260px]"
        } ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-neutral-200/60">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #e06b6b, #c85555)" }}
          >
            <span className="text-white text-xs font-bold">AB</span>
          </div>
          {!collapsed && (
            <div className="animate-fade-in min-w-0">
              <h1 className="text-sm font-semibold text-neutral-800 truncate">AI & Beyond</h1>
              <p className="text-[10px] text-neutral-400 font-medium">Agency Dashboard</p>
            </div>
          )}
        </div>

        {/* Workspace switcher */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-1" ref={wsDropdownRef}>
            <p className="px-2 pb-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
              Workspace
            </p>
            <div className="relative">
              <button
                onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-sm text-neutral-700 hover:bg-neutral-100 transition-colors border border-neutral-200/60"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-4 h-4 rounded bg-warm-400/20 flex items-center justify-center shrink-0">
                    <span className="text-[8px] font-bold text-warm-500">
                      {activeWorkspace?.name?.[0]?.toUpperCase() || "W"}
                    </span>
                  </div>
                  <span className="truncate text-xs font-medium">
                    {activeWorkspace?.name || "Select workspace"}
                  </span>
                </div>
                <ChevronDown size={12} className="text-neutral-400 shrink-0" />
              </button>

              {wsDropdownOpen && (
                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 overflow-hidden animate-fade-in">
                  <div className="max-h-48 overflow-y-auto p-1">
                    {workspaces.length === 0 ? (
                      <p className="p-3 text-xs text-neutral-400 text-center">No workspaces yet</p>
                    ) : (
                      workspaces.map((ws) => (
                        <button
                          key={ws.id}
                          onClick={() => { setActiveWorkspace(ws); setWsDropdownOpen(false); }}
                          className={`w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-neutral-50 transition-colors ${
                            activeWorkspace?.id === ws.id
                              ? "bg-warm-50 text-warm-500 font-medium"
                              : "text-neutral-700"
                          }`}
                        >
                          {ws.name}
                        </button>
                      ))
                    )}
                  </div>

                  {/* Join or Create workspace — visible to all authenticated users */}
                  <div className="border-t border-neutral-100 p-1">
                    <button
                      onClick={() => openWsModal("join")}
                      className="flex items-center gap-1.5 w-full px-2.5 py-2 rounded-md text-xs text-neutral-500 hover:bg-neutral-50 transition-colors"
                    >
                      <Plus size={11} />
                      Join or Create a Workspace
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          <p className="px-2 pt-2 pb-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
            {collapsed ? "" : "Navigation"}
          </p>
          {navItems
            .filter((item) => (!item.adminOnly || isAdmin) && (!item.ownerOnly || isOwner))
            .map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`sidebar-item ${isActive ? "active" : ""}`}
                  title={collapsed ? item.label : undefined}
                  onClick={onClose}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}

          {!collapsed && (
            <div className="mt-4">
              <p className="px-2 pt-2 pb-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
                Members
              </p>
              <MembersList />
            </div>
          )}
        </nav>



        {/* User footer */}
        <div className="px-2 py-3 border-t border-neutral-200/60">
          {!collapsed && profile && (
            <div className="px-2 mb-2">
              <div className="flex items-center gap-2">
                <UserAvatar
                  fullName={profile.full_name}
                  image={profile.image}
                  size={24}
                  className="rounded-md"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-neutral-700 truncate">
                    {profile.full_name || profile.email?.split("@")[0] || "User"}
                  </p>
                  <p className="text-[9px] text-neutral-400 truncate">{profile.email}</p>
                  <p className="text-[9px] font-bold text-warm-400 mt-0.5">{profile.role}</p>
                </div>
              </div>
            </div>
          )}
          <button
            onClick={() => { onClose?.(); signOut(); }}
            className="sidebar-item w-full text-neutral-500 hover:text-red-500"
            title={collapsed ? "Sign Out" : undefined}
          >
            <LogOut size={16} />
            {!collapsed && <span className="text-sm">Sign Out</span>}
          </button>
          {!collapsed && (
            <div className="px-2 mt-2 pt-2 border-t border-neutral-200/60 text-center">
              <Link
                href="/dashboard/policy"
                onClick={onClose}
                className="text-[10px] text-neutral-400 hover:text-warm-500 transition-colors font-medium"
              >
                Privacy Policy
              </Link>
            </div>
          )}
        </div>

        {/* Collapse toggle — desktop only */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-7 w-6 h-6 rounded-full bg-white border border-neutral-200 hidden md:flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:border-neutral-300 transition-all shadow-sm"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight size={11} /> : <ChevronsLeft size={11} />}
        </button>
      </aside>

      {/* Join or Create Workspace modal */}
      {showWsModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-neutral-800">Join or Create a Workspace</h2>
              <button
                onClick={closeWsModal}
                className="p-1.5 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
              >
                <X size={15} />
              </button>
            </div>

            {/* Tab selector */}
            <div className="flex gap-1 mb-5 bg-neutral-100 rounded-lg p-1">
              <button
                onClick={() => setWsModalMode("join")}
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                  wsModalMode === "join"
                    ? "bg-white text-neutral-800 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                Join via invite code
              </button>
              {(isAdmin || isOwner) && (
                <button
                  onClick={() => setWsModalMode("create")}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                    wsModalMode === "create"
                      ? "bg-white text-neutral-800 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  Create new
                </button>
              )}
            </div>

            {wsModalMode === "join" && (
              <div className="space-y-3">
                {joinPending ? (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-700">
                    Your request has been submitted. A workspace admin must approve it before you gain access. You can close this window.
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider block mb-1">
                        Invite Code
                      </label>
                      <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => { setJoinCode(e.target.value); setJoinError(""); }}
                        placeholder="Paste your invite code here"
                        className="glass-input text-sm"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleJoinWorkspace(); }}
                      />
                      {joinError && (
                        <p className="text-[10px] text-red-500 mt-1">{joinError}</p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={handleJoinWorkspace}
                        disabled={!joinCode.trim() || joining}
                        className="btn-primary flex-1 text-sm py-2"
                      >
                        {joining ? "Joining..." : "Join Workspace"}
                      </button>
                      <button
                        onClick={closeWsModal}
                        className="btn-ghost text-sm py-2 px-4"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
                {joinPending && (
                  <button onClick={closeWsModal} className="btn-ghost text-sm py-2 w-full">
                    Close
                  </button>
                )}
              </div>
            )}

            {wsModalMode === "create" && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider block mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    placeholder="e.g. AI Research Q3"
                    className="glass-input text-sm"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreateWorkspace(); }}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider block mb-1">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={newWsDesc}
                    onChange={(e) => setNewWsDesc(e.target.value)}
                    placeholder="What is this workspace for?"
                    className="glass-input text-sm"
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleCreateWorkspace}
                    disabled={!newWsName.trim() || creatingWs}
                    className="btn-primary flex-1 text-sm py-2"
                  >
                    {creatingWs ? "Creating..." : "Create Workspace"}
                  </button>
                  <button
                    onClick={closeWsModal}
                    className="btn-ghost text-sm py-2 px-4"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Clickable member list for the Admin nav section
function MembersList() {
  const [members, setMembers] = useState<{ id: string; full_name: string; email: string; image?: string | null }[]>([]);
  const { refreshKey } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const pathname = usePathname();

  useEffect(() => {
    const fetchMembers = async () => {
      if (!activeWorkspace?.id) return;
      try {
        const res = await fetch(`/api/members?workspaceId=${activeWorkspace.id}`);
        if (!res.ok) return;
        setMembers(await res.json());
      } catch (err) {
        console.error("Failed to fetch members:", err);
      }
    };
    fetchMembers();
  }, [refreshKey, activeWorkspace?.id]);

  return (
    <div className="space-y-0.5">
      {members.map((member) => {
        const href = `/dashboard/member/${member.id}`;
        const isActive = pathname === href;
        return (
          <Link
            key={member.id}
            href={href}
            className={`sidebar-item ${isActive ? "active" : ""}`}
          >
            <UserAvatar
              fullName={member.full_name}
              image={member.image}
              size={20}
              className="rounded"
            />
            <span className="truncate text-sm">{member.full_name || "User"}</span>
          </Link>
        );
      })}
    </div>
  );
}
