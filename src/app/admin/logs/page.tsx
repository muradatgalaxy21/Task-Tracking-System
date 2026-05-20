"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  RefreshCw,
  Filter,
  CheckCircle2,
  Trash2,
  ArrowRightLeft,
  MessageSquare,
  PenLine,
  LogIn,
  UserPlus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type AuditEventType =
  | "task_created"
  | "task_deleted"
  | "task_status_change"
  | "task_edited"
  | "task_comment"
  | "user_login"
  | "user_signup";

type LogEntry = {
  id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  user_id: string | null;
  actor_name: string;
  actor_email: string | null;
  event_type: AuditEventType;
  entity_id: string | null;
  entity_name: string | null;
  metadata: string | null;
  created_at: string;
};

type Workspace = { id: string; name: string };

const EVENT_LABELS: Record<AuditEventType, string> = {
  task_created:       "Task Created",
  task_deleted:       "Task Deleted",
  task_status_change: "Status Changed",
  task_edited:        "Task Edited",
  task_comment:       "Comment Added",
  user_login:         "User Login",
  user_signup:        "User Signup",
};

const EVENT_COLORS: Record<AuditEventType, { bg: string; text: string; border: string }> = {
  task_created:       { bg: "bg-blue-950/40",    text: "text-blue-400",    border: "border-blue-800/40" },
  task_deleted:       { bg: "bg-red-950/40",     text: "text-red-400",     border: "border-red-800/40" },
  task_status_change: { bg: "bg-amber-950/40",   text: "text-amber-400",   border: "border-amber-800/40" },
  task_edited:        { bg: "bg-purple-950/40",  text: "text-purple-400",  border: "border-purple-800/40" },
  task_comment:       { bg: "bg-teal-950/40",    text: "text-teal-400",    border: "border-teal-800/40" },
  user_login:         { bg: "bg-neutral-900/60", text: "text-neutral-400", border: "border-neutral-700/40" },
  user_signup:        { bg: "bg-emerald-950/40", text: "text-emerald-400", border: "border-emerald-800/40" },
};

function EventIcon({ type }: { type: AuditEventType }) {
  const size = 13;
  switch (type) {
    case "task_created":       return <CheckCircle2 size={size} />;
    case "task_deleted":       return <Trash2 size={size} />;
    case "task_status_change": return <ArrowRightLeft size={size} />;
    case "task_edited":        return <PenLine size={size} />;
    case "task_comment":       return <MessageSquare size={size} />;
    case "user_login":         return <LogIn size={size} />;
    case "user_signup":        return <UserPlus size={size} />;
    default:                   return null;
  }
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatMeta(log: LogEntry): string | null {
  if (!log.metadata) return null;
  try {
    const m = JSON.parse(log.metadata);
    if (log.event_type === "task_status_change" && m.from_label && m.to_label) {
      return `${m.from_label} → ${m.to_label}`;
    }
    if (log.event_type === "task_edited" && m.field) {
      return `field: ${m.field}`;
    }
    if (log.event_type === "task_comment" && m.preview) {
      return `"${m.preview}"`;
    }
    return null;
  } catch {
    return null;
  }
}

const PAGE_SIZE = 50;

const ALL_EVENT_TYPES: AuditEventType[] = [
  "task_created",
  "task_deleted",
  "task_status_change",
  "task_edited",
  "task_comment",
  "user_login",
  "user_signup",
];

export default function AdminLogsPage() {
  const [logs, setLogs]               = useState<LogEntry[]>([]);
  const [total, setTotal]             = useState(0);
  const [workspaces, setWorkspaces]   = useState<Workspace[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");

  const [filterWorkspace, setFilterWorkspace] = useState<string>("all");
  const [filterEvent, setFilterEvent]         = useState<string>("all");
  // Cursor stack for back navigation: each entry is the cursor used to fetch that page.
  // cursorStack[0] = undefined (first page), cursorStack[1] = cursor for page 2, etc.
  const [cursorStack, setCursorStack]         = useState<(string | undefined)[]>([undefined]);
  const [nextCursor, setNextCursor]           = useState<string | null>(null);

  // Build grouped view: workspace_id → entries (null = auth events)
  const grouped = (() => {
    const filtered = logs.filter((l) => {
      if (search) {
        const q = search.toLowerCase();
        return (
          l.actor_name.toLowerCase().includes(q) ||
          (l.entity_name || "").toLowerCase().includes(q) ||
          (l.actor_email || "").toLowerCase().includes(q)
        );
      }
      return true;
    });

    const map = new Map<string, { label: string; entries: LogEntry[] }>();
    for (const log of filtered) {
      const key = log.workspace_id ?? "__auth__";
      const label = log.workspace_name ?? "Auth Events";
      if (!map.has(key)) map.set(key, { label, entries: [] });
      map.get(key)!.entries.push(log);
    }
    return map;
  })();

  // currentCursor is the cursor for the page currently being shown (undefined = first page)
  const currentCursor = cursorStack[cursorStack.length - 1];

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (currentCursor)              params.set("cursor", currentCursor);
      if (filterWorkspace !== "all") params.set("workspace_id", filterWorkspace);
      if (filterEvent !== "all")     params.set("event_type", filterEvent);

      const res = await fetch(`/api/admin/logs?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setNextCursor(data.nextCursor ?? null);
    } finally {
      setLoading(false);
    }
  }, [filterWorkspace, filterEvent, currentCursor]);

  // Fetch workspace list once for filter dropdown
  useEffect(() => {
    fetch("/api/admin/workspaces")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setWorkspaces(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset cursor to first page when filters change
  const setFilter = (type: "workspace" | "event", value: string) => {
    setCursorStack([undefined]);
    setNextCursor(null);
    if (type === "workspace") setFilterWorkspace(value);
    else setFilterEvent(value);
  };

  const currentPage  = cursorStack.length - 1;
  const totalPages   = Math.ceil(total / PAGE_SIZE);
  const hasPrev      = currentPage > 0;
  const hasNext      = nextCursor !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Audit Logs</h1>
          <p className="text-xs text-white/40 mt-0.5">{total.toLocaleString()} total events</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, task name..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-white/5 border border-white/10 text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/30"
          />
        </div>

        {/* Workspace filter */}
        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-white/30" />
          <select
            value={filterWorkspace}
            onChange={(e) => setFilter("workspace", e.target.value)}
            className="text-xs rounded-md bg-white/5 border border-white/10 text-white/70 px-2 py-1.5 focus:outline-none focus:border-white/30"
          >
            <option value="all">All Workspaces</option>
            <option value="auth">Auth Events Only</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        {/* Event type filter */}
        <select
          value={filterEvent}
          onChange={(e) => setFilter("event", e.target.value)}
          className="text-xs rounded-md bg-white/5 border border-white/10 text-white/70 px-2 py-1.5 focus:outline-none focus:border-white/30"
        >
          <option value="all">All Event Types</option>
          {ALL_EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{EVENT_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Log groups */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <RefreshCw size={18} className="animate-spin text-white/20" />
        </div>
      ) : grouped.size === 0 ? (
        <div className="flex items-center justify-center h-40 text-white/30 text-sm">
          No logs found
        </div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([key, { label, entries }]) => (
            <div key={key} className="space-y-1">
              {/* Group header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-widest font-semibold text-white/30">
                  {label}
                </span>
                <span className="text-[10px] text-white/20 bg-white/5 px-1.5 py-0.5 rounded">
                  {entries.length}
                </span>
                <div className="flex-1 border-t border-white/5" />
              </div>

              {/* Log rows */}
              <div className="rounded-lg border border-white/5 overflow-hidden divide-y divide-white/5">
                {entries.map((log) => {
                  const colors = EVENT_COLORS[log.event_type] ?? EVENT_COLORS.task_edited;
                  const meta   = formatMeta(log);
                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 px-4 py-2.5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                    >
                      {/* Event type pill */}
                      <span
                        className={`shrink-0 mt-0.5 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}
                      >
                        <EventIcon type={log.event_type} />
                        {EVENT_LABELS[log.event_type]}
                      </span>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-white/80">
                            {log.actor_name}
                          </span>
                          {log.actor_email && (
                            <span className="text-[10px] text-white/30">{log.actor_email}</span>
                          )}
                          {log.entity_name && (
                            <>
                              <span className="text-white/20 text-[10px]">·</span>
                              <span className="text-[10px] text-white/50 truncate max-w-[200px]">
                                {log.entity_name}
                              </span>
                            </>
                          )}
                        </div>
                        {meta && (
                          <p className="text-[10px] text-white/30 mt-0.5 truncate">{meta}</p>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-white/30">{formatRelative(log.created_at)}</p>
                        <p className="text-[10px] text-white/15 mt-0.5">
                          {new Date(log.created_at).toLocaleString("en-US", {
                            month: "short", day: "numeric",
                            hour: "numeric", minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-[10px] text-white/30">
            Page {currentPage + 1} of {totalPages || "?"}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCursorStack((s) => s.slice(0, -1))}
              disabled={!hasPrev}
              className="p-1.5 rounded text-white/40 hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => {
                if (nextCursor) setCursorStack((s) => [...s, nextCursor]);
              }}
              disabled={!hasNext}
              className="p-1.5 rounded text-white/40 hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
