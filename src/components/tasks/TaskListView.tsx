"use client";

// -------------------------------------------------------------------
// Task List View Component (Notion-Like Data Table)
// Displays tasks in a clean data table with column headers.
// Tabs filter by status. Each row expands for details.
// -------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import type { TaskLedger, Profile, TaskStatus } from "@/lib/types";
import { useAuth } from "@/components/providers/AuthProvider";
import TaskTableRow from "@/components/tasks/TaskTableRow";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import { Plus, RefreshCw, LayoutList } from "lucide-react";

// Tab configuration
type TabType = "All" | TaskStatus;

const TABS: { id: TabType; label: string; color: string }[] = [
  { id: "All", label: "All Tasks", color: "#37352f" },
  { id: "Todo", label: "To Do", color: "#91918e" },
  { id: "In Progress", label: "In Progress", color: "#337ea9" },
  { id: "In Review", label: "In Review", color: "#cb912f" },
  { id: "Completed", label: "Completed", color: "#448361" },
];

export default function TaskListView() {
  const { user, profile, refreshKey } = useAuth();
  const [tasks, setTasks] = useState<TaskLedger[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("All");
  
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch tasks
      const tasksRes = await fetch("/api/tasks");
      if (!tasksRes.ok) throw new Error("Failed to fetch tasks");
      const tasksData = await tasksRes.json();

      // Fetch members
      const membersRes = await fetch("/api/members");
      if (!membersRes.ok) throw new Error("Failed to fetch members");
      const membersData = await membersRes.json();

      const finalMembers = (membersData || []) as unknown as Profile[];

      // Fallback for current user if not in members list (shouldn't happen with SQLite usually)
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
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const displayedTasks = tasks.filter((t) => {
    if (activeTab === "All") return true;
    return t.status === activeTab;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-800">Tasks</h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            {tasks.length} total tasks across the team
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="btn-ghost flex items-center gap-1.5 text-sm py-2 px-3"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3"
          >
            <Plus size={14} />
            New Task
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto hide-scrollbar gap-1 pb-0 border-b border-neutral-200/80">
        {TABS.map((tab) => {
          const count = tab.id === "All" 
            ? tasks.length 
            : tasks.filter(t => t.status === tab.id).length;
            
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
              {tab.id === "All" ? (
                <LayoutList size={13} className={isActive ? "text-neutral-700" : "text-neutral-400"} />
              ) : (
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: tab.color }}
                />
              )}
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                isActive ? "bg-warm-200/60 text-neutral-700" : "bg-neutral-100 text-neutral-400"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          {displayedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 text-center">
              <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3 text-neutral-300">
                <LayoutList size={24} />
              </div>
              <h3 className="text-sm font-medium text-neutral-600">No tasks found</h3>
              <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                There are currently no tasks in the &quot;{TABS.find(t => t.id === activeTab)?.label}&quot; category.
              </p>
              {activeTab !== "All" && (
                <button 
                  onClick={() => setActiveTab("All")}
                  className="mt-3 text-xs text-warm-400 hover:text-warm-500 font-medium"
                >
                  View all tasks
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
                    <th className="text-right" style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTasks.map((task) => (
                    <TaskTableRow
                      key={task.task_id}
                      task={task}
                      members={members}
                      onUpdate={fetchData}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create task modal */}
      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchData}
        members={members}
      />
    </div>
  );
}
