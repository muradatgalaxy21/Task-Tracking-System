"use client";

// Task board with dual view toggle (Kanban / List) and filter bar.
// Kanban shows 4 columns; List shows the dense data table.
// Filters: free-text search, Assigned to Me, High/Urgent priority, Due Today.

import { useState, useEffect, useCallback, useMemo } from "react";
import type { TaskLedger, Profile, TaskStatus } from "@/lib/types";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import TaskTableRow from "@/components/tasks/TaskTableRow";
import KanbanBoard from "@/components/tasks/KanbanBoard";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import TaskDetailPanel from "@/components/tasks/TaskDetailPanel";
import {
  Plus,
  RefreshCw,
  LayoutList,
  LayoutGrid,
  Search,
  X,
  UserCheck,
  Flame,
  CalendarClock,
} from "lucide-react";

type ViewMode = "list" | "kanban";
type TabType = "All" | TaskStatus;

const TABS: { id: TabType; label: string; color: string }[] = [
  { id: "All",         label: "All",        color: "#37352f"  },
  { id: "Todo",        label: "Backlog",     color: "#91918e"  },
  { id: "In Progress", label: "In Progress", color: "#337ea9"  },
  { id: "In Review",   label: "Review",      color: "#cb912f"  },
  { id: "Completed",   label: "Completed",   color: "#448361"  },
];

export default function TaskListView() {
  const { user, profile, refreshKey, isAdmin, isMember } = useAuth();
  const { activeWorkspace, isWorkspaceAdmin } = useWorkspace();
  const [tasks, setTasks]       = useState<TaskLedger[]>([]);
  const [members, setMembers]   = useState<Profile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeTab, setActiveTab] = useState<TabType>("All");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Derive selectedTask from the live tasks array so the panel always shows fresh data
  const selectedTask = selectedTaskId
    ? tasks.find((t) => t.task_id === selectedTaskId) ?? null
    : null;

  // Filter state
  const [search, setSearch]             = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [highPriority, setHighPriority] = useState(false);
  const [dueToday, setDueToday]         = useState(false);

  const fetchData = useCallback(async () => {
    // Show empty state when no workspace is active rather than loading all data
    if (!activeWorkspace?.id) {
      setTasks([]);
      setMembers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [tasksRes, membersRes] = await Promise.all([
        fetch(`/api/tasks?workspaceId=${activeWorkspace.id}`),
        fetch(`/api/members?workspaceId=${activeWorkspace.id}`),
      ]);

      if (!tasksRes.ok || !membersRes.ok) throw new Error("Fetch failed");

      const tasksData: TaskLedger[] = await tasksRes.json();
      const membersData: Profile[]  = await membersRes.json();

      // Ensure the current user appears in the members list for task assignment display
      const finalMembers = membersData || [];
      if (user && !finalMembers.some((m) => m.id === user.id)) {
        finalMembers.push({
          id: user.id,
          email: user.email || "",
          full_name: profile?.full_name || user.email?.split("@")[0] || "Me",
          role: (profile?.role as any) || "Member",
          created_at: new Date().toISOString(),
        });
      }

      setTasks(tasksData);
      setMembers(finalMembers);
    } catch (err) {
      console.error("TaskListView fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [user, profile, activeWorkspace?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey, activeWorkspace?.id]);

  // Apply status tab filter, then all active filters
  const filteredTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return tasks.filter((t) => {
      if (activeTab !== "All" && t.status !== activeTab) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (assignedToMe && t.assignee_id !== user?.id) return false;
      if (highPriority && t.priority !== "High" && t.priority !== "Urgent") return false;
      if (dueToday) {
        const deadline = new Date(t.max_deadline);
        if (deadline < today || deadline >= tomorrow) return false;
      }
      return true;
    });
  }, [tasks, activeTab, search, assignedToMe, highPriority, dueToday, user?.id]);

  const hasActiveFilter = search || assignedToMe || highPriority || dueToday;

  const clearFilters = () => {
    setSearch("");
    setAssignedToMe(false);
    setHighPriority(false);
    setDueToday(false);
  };

  const canCreate = isAdmin || isMember || isWorkspaceAdmin;

  return (
    <div className="space-y-4">
      {/* Top bar: title + view toggle + create button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-800">Tasks</h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            {filteredTasks.length} of {tasks.length} tasks
            {hasActiveFilter && " (filtered)"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Kanban / List toggle */}
          <div className="flex items-center border border-neutral-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
              }`}
              title="List view"
            >
              <LayoutList size={13} />
              List
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === "kanban"
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
              }`}
              title="Kanban view"
            >
              <LayoutGrid size={13} />
              Kanban
            </button>
          </div>

          <button
            onClick={fetchData}
            className="btn-ghost flex items-center gap-1.5 text-sm py-2 px-3"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>

          {canCreate && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3"
            >
              <Plus size={14} />
              New Task
            </button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="glass-input pl-8 py-2 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Quick-filter chips */}
        <button
          onClick={() => setAssignedToMe(!assignedToMe)}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition-all ${
            assignedToMe
              ? "bg-warm-400/10 border-warm-400/30 text-warm-500"
              : "bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300"
          }`}
        >
          <UserCheck size={12} />
          Assigned to Me
        </button>

        <button
          onClick={() => setHighPriority(!highPriority)}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition-all ${
            highPriority
              ? "bg-red-50 border-red-200 text-red-600"
              : "bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300"
          }`}
        >
          <Flame size={12} />
          High Priority
        </button>

        <button
          onClick={() => setDueToday(!dueToday)}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition-all ${
            dueToday
              ? "bg-amber-50 border-amber-200 text-amber-600"
              : "bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300"
          }`}
        >
          <CalendarClock size={12} />
          Due Today
        </button>

        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <X size={11} />
            Clear
          </button>
        )}
      </div>

      {/* Status tabs (list view only — kanban has its own column headers) */}
      {viewMode === "list" && (
        <div className="flex overflow-x-auto hide-scrollbar gap-1 border-b border-neutral-200/80">
          {TABS.map((tab) => {
            const count =
              tab.id === "All"
                ? tasks.length
                : tasks.filter((t) => t.status === tab.id).length;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                  isActive
                    ? "text-neutral-800 border-warm-400"
                    : "text-neutral-400 hover:text-neutral-600 border-transparent"
                }`}
              >
                {tab.id !== "All" && (
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tab.color }}
                  />
                )}
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? "bg-warm-200/60 text-neutral-700"
                      : "bg-neutral-100 text-neutral-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main content area */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : viewMode === "kanban" ? (
        <KanbanBoard
          tasks={filteredTasks}
          members={members}
          onUpdate={fetchData}
          onOpenPanel={(task) => setSelectedTaskId(task.task_id)}
        />
      ) : (
        <div className="glass-card overflow-hidden">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 text-center">
              <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3 text-neutral-300">
                <LayoutList size={24} />
              </div>
              <h3 className="text-sm font-medium text-neutral-600">No tasks found</h3>
              <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                {hasActiveFilter
                  ? "No tasks match your current filters."
                  : `No tasks in "${TABS.find((t) => t.id === activeTab)?.label}" yet.`}
              </p>
              {(hasActiveFilter || activeTab !== "All") && (
                <button
                  onClick={() => { clearFilters(); setActiveTab("All"); }}
                  className="mt-3 text-xs text-warm-400 hover:text-warm-500 font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="notion-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>Task</th>
                    <th>Status</th>
                    <th>Assignee</th>
                    <th>Priority</th>
                    <th>Deadline</th>
                    <th>Progress</th>
                    <th className="text-right">Multiplier</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => (
                    <TaskTableRow
                      key={task.task_id}
                      task={task}
                      members={members}
                      onUpdate={fetchData}
                      onOpenPanel={(t) => setSelectedTaskId(t.task_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchData}
        members={members}
        workspaceId={activeWorkspace?.id}
      />

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          members={members}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={fetchData}
        />
      )}
    </div>
  );
}
