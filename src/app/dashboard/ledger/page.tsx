"use client";

// -------------------------------------------------------------------
// Task Ledger Page
// Shows a full history/table view of all tasks (past and present).
// Filterable by member, status, and date range.
// Restyled for warm light theme.
// -------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import type { TaskLedger, Profile, TaskStatus } from "@/lib/types";
import { getMultiplier } from "@/lib/calculations";
import { Search, Filter, Clock, AlertTriangle } from "lucide-react";

export default function LedgerPage() {
  const { refreshKey } = useAuth();
  const [tasks, setTasks] = useState<TaskLedger[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "All">("All");
  const [filterMember, setFilterMember] = useState<string>("All");

  // Fetch all tasks and member profiles for the ledger view
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [tasksRes, membersRes] = await Promise.all([
        fetch("/api/tasks"),
        fetch("/api/members")
      ]);

      if (!tasksRes.ok || !membersRes.ok) {
        throw new Error("Failed to fetch ledger data");
      }

      const tasksData = await tasksRes.json();
      const membersData = await membersRes.json();

      setTasks(tasksData);
      setMembers(membersData);
    } catch (err) {
      console.error("Failed to fetch ledger data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // Apply search and filter criteria to task list
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      filterStatus === "All" || task.status === filterStatus;
    const matchesMember =
      filterMember === "All" || task.assignee_id === filterMember;

    return matchesSearch && matchesStatus && matchesMember;
  });

  // Get the status CSS class for the badge
  const getStatusClass = (status: string): string => {
    switch (status) {
      case "Todo":
        return "status-todo";
      case "In Progress":
        return "status-in-progress";
      case "In Review":
        return "status-in-review";
      case "Completed":
        return "status-completed";
      case "Not Done":
        return "bg-red-50 text-red-600";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-neutral-800">Task Ledger</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Complete history of all assigned tasks
        </p>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="glass-input"
              style={{ paddingLeft: "2.5rem" }}
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-neutral-400" />
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as TaskStatus | "All")
              }
              className="glass-select w-auto min-w-[140px]"
            >
              <option value="All">All Status</option>
              <option value="Todo">Todo</option>
              <option value="In Progress">In Progress</option>
              <option value="In Review">In Review</option>
              <option value="Completed">Completed</option>
              <option value="Not Done">Not Done</option>
              <option value="Discarded">Discarded</option>
            </select>
          </div>

          {/* Member filter */}
          <select
            value={filterMember}
            onChange={(e) => setFilterMember(e.target.value)}
            className="glass-select w-auto min-w-[160px]"
          >
            <option value="All">All Members</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || "Unknown"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="notion-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Assignee</th>
                  <th className="text-center">Est. Days</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Deadline</th>
                  <th className="text-center">Multiplier</th>
                  <th className="text-center">Earned</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-12 text-neutral-400"
                    >
                      No tasks found.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const assignee = members.find(
                      (m) => m.id === task.assignee_id
                    );
                    const isTerminalTask = task.status === "Completed" || task.status === "Not Done";
                    const multiplier =
                      task.multiplier_earned ?? (isTerminalTask
                        ? getMultiplier(task.completed_at || new Date().toISOString(), task.max_deadline).multiplier
                        : 0);
                    const label =
                      task.status === "Completed"
                        ? getMultiplier(task.completed_at || new Date().toISOString(), task.max_deadline).label
                        : task.status === "Not Done"
                        ? "Not Done"
                        : "";
                    const isOverdue =
                      new Date(task.max_deadline) < new Date() &&
                      !isTerminalTask;

                    return (
                      <tr
                        key={task.task_id}
                        className={isOverdue ? "bg-red-50/30" : ""}
                      >
                        {/* Title */}
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-neutral-800">
                            {task.title}
                          </p>
                          <p className="text-xs text-neutral-400 truncate max-w-[250px]">
                            {task.description}
                          </p>
                        </td>

                        {/* Assignee */}
                        <td className="px-4 py-3">
                          <span className="text-sm text-neutral-600">
                            {assignee?.full_name || "Unknown"}
                          </span>
                        </td>

                        {/* Est. Days */}
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-medium text-purple-500">
                            {task.estimated_days}d
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md text-xs font-medium ${getStatusClass(
                              task.status
                            )}`}
                          >
                            {task.status}
                          </span>
                        </td>

                        {/* Deadline */}
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`flex items-center justify-center gap-1 text-xs ${
                              isOverdue ? "text-red-500" : "text-neutral-500"
                            }`}
                          >
                            {isOverdue ? (
                              <AlertTriangle size={12} />
                            ) : (
                              <Clock size={12} />
                            )}
                            {new Date(task.max_deadline).toLocaleDateString()}
                          </span>
                        </td>

                        {/* Multiplier */}
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-xs font-semibold ${
                              multiplier === 1
                                ? "text-green-600"
                                : multiplier >= 0.6
                                ? "text-amber-600"
                                : multiplier >= 0.3
                                ? "text-orange-500"
                                : "text-red-500"
                            }`}
                          >
                            {isTerminalTask
                              ? `${multiplier}x`
                              : "-"}
                          </span>
                          <p className="text-[10px] text-neutral-400">
                            {label}
                          </p>
                        </td>

                        {/* Earned (multiplier label) */}
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-sm font-bold ${
                              isTerminalTask
                                ? multiplier >= 1.0
                                  ? "text-green-600"
                                  : multiplier >= 0.6
                                  ? "text-amber-600"
                                  : multiplier > 0
                                  ? "text-orange-500"
                                  : "text-red-500"
                                : "text-neutral-300"
                            }`}
                          >
                            {isTerminalTask ? multiplier : "-"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
