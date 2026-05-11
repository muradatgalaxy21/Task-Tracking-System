"use client";

// -------------------------------------------------------------------
// Sidebar Navigation Component (Notion-Inspired)
// Shows workspace navigation with pages, plus admin tools.
// Clean light sidebar with warm accent colors.
// -------------------------------------------------------------------

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useState, useEffect } from "react";
import type { Workspace, Page } from "@/lib/types";
import {
  LayoutDashboard,
  LogOut,
  ClipboardList,
  Calculator,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Plus,
  FileText,
  CheckSquare,
  Search,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

export default function Sidebar() {
  const { profile, isAdmin, refreshKey, signOut } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());

  // Fetch workspaces and their pages from the new API
  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        const response = await fetch("/api/workspaces");
        if (!response.ok) throw new Error("Failed to fetch");
        
        const data = await response.json();
        setWorkspaces(data);
        
        // Flatten pages from workspaces
        const allPages = data.flatMap((ws: any) => ws.pages || []);
        setPages(allPages);

        // Auto-expand and select first workspace
        if (data.length > 0 && !activeWorkspaceId) {
          setActiveWorkspaceId(data[0].id);
          setExpandedWorkspaces(new Set([data[0].id]));
        }
      } catch (err) {
        console.error("Failed to fetch workspaces:", err);
      }
    };
    fetchWorkspaces();
  }, [refreshKey, activeWorkspaceId]);

  // Toggle workspace expansion
  const toggleWorkspace = (wsId: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(wsId)) {
        next.delete(wsId);
      } else {
        next.add(wsId);
      }
      return next;
    });
  };

  // Get page icon based on type
  const getPageIcon = (type: string) => {
    switch (type) {
      case "tasks":
        return <CheckSquare size={15} />;
      case "attendance":
        return <CalendarCheck size={15} />;
      case "notes":
        return <FileText size={15} />;
      default:
        return <FileText size={15} />;
    }
  };

  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: "Task Ledger",
      href: "/dashboard/ledger",
      icon: <ClipboardList size={18} />,
    },
    {
      label: "Attendance",
      href: "/dashboard/attendance",
      icon: <CalendarCheck size={18} />,
    },
    {
      label: "Payout Calculator",
      href: "/dashboard/payout",
      icon: <Calculator size={18} />,
    },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-200 ${
        collapsed ? "w-[56px]" : "w-[260px]"
      }`}
      style={{
        background: "#fbfbfa",
        borderRight: "1px solid rgba(55, 53, 47, 0.09)",
      }}
    >
      {/* Logo / Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-neutral-200/60">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(135deg, #e06b6b, #c85555)",
          }}
        >
          <span className="text-white text-xs font-bold">AB</span>
        </div>
        {!collapsed && (
          <div className="animate-fade-in min-w-0">
            <h1 className="text-sm font-semibold text-neutral-800 truncate">
              AI & Beyond
            </h1>
            <p className="text-[10px] text-neutral-400 font-medium">
              Evaluator
            </p>
          </div>
        )}
      </div>

      {/* Search placeholder (collapsed hides it) */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-neutral-400 hover:bg-neutral-100 transition-colors cursor-pointer text-sm">
            <Search size={14} />
            <span className="text-xs">Search</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {/* Main navigation items */}
        <p className="px-2 pt-2 pb-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
          {collapsed ? "" : "Main"}
        </p>
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-item ${isActive ? "active" : ""}`}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}

        {/* Workspaces hidden as per request to simplify for single-group use */}


        {/* Members shortcut (for Admin to access member pages) */}
        {isAdmin && !collapsed && (
          <div className="mt-4">
            <p className="px-2 pt-2 pb-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
              Team
            </p>
            <MembersList />
          </div>
        )}
      </nav>

      {/* Footer: User info + Sign out */}
      <div className="px-2 py-3 border-t border-neutral-200/60">
        {/* User info */}
        {!collapsed && profile && (
          <div className="px-2 mb-2">
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[9px] font-bold text-white"
                style={{ background: "#e06b6b" }}
              >
                {profile.full_name
                  ? profile.full_name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)
                  : "U"}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-700 truncate">
                  {profile.full_name || profile.email?.split('@')[0] || "User"}
                </p>
                <p className="text-[9px] text-neutral-400 truncate tracking-tight">{profile.email}</p>
                <p className="text-[9px] font-bold text-warm-400 mt-0.5">{profile.role}</p>
              </div>
            </div>
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={signOut}
          className="sidebar-item w-full text-neutral-500 hover:text-red-500"
        >
          <LogOut size={16} />
          {!collapsed && <span className="text-sm">Sign Out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-7 w-6 h-6 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:border-neutral-300 transition-all shadow-sm"
      >
        {collapsed ? (
          <ChevronRight size={11} />
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        )}
      </button>
    </aside>
  );
}

// Sub-component: Members list for Admin sidebar
function MembersList() {
  const [members, setMembers] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const { refreshKey } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const response = await fetch("/api/members");
        if (!response.ok) throw new Error("Failed to fetch");
        const data = await response.json();
        setMembers(data);
      } catch (err) {
        console.error("Failed to fetch members:", err);
      }
    };
    fetchMembers();
  }, [refreshKey]);

  return (
    <div className="space-y-0.5">
      {members.map((member) => {
        const href = `/dashboard/member/${member.id}`;
        const isActive = pathname === href;
        const initials = member.full_name
          ? member.full_name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)
          : "U";

        return (
          <Link
            key={member.id}
            href={href}
            className={`sidebar-item ${isActive ? "active" : ""}`}
          >
            <span
              className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0 ${
                isActive
                  ? "bg-warm-400/15 text-warm-400"
                  : "bg-neutral-200/60 text-neutral-500"
              }`}
            >
              {initials}
            </span>
            <span className="truncate text-sm">{member.full_name || "User"}</span>
          </Link>
        );
      })}
    </div>
  );
}
