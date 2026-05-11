"use client";

// -------------------------------------------------------------------
// Task Table Row Component (Notion-Like)
// Displays a single task as a data table row with inline expand
// for description, sub-tasks, and status transitions.
// -------------------------------------------------------------------

import { useState } from "react";
import type { TaskLedger, Profile, TaskStatus, TaskPriority } from "@/lib/types";
import { useAuth } from "@/components/providers/AuthProvider";
import { getMultiplier } from "@/lib/calculations";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Edit3,
  Zap,
} from "lucide-react";

interface TaskTableRowProps {
  task: TaskLedger;
  members: Profile[];
  onUpdate: () => void;
}

export default function TaskTableRow({ task, members, onUpdate }: TaskTableRowProps) {
  const { isAdmin, user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(task.description);
  const [loading, setLoading] = useState(false);

  // Find the assignee profile
  const assignee = members.find((m) => m.id === task.assignee_id);
  const isOwnTask = user?.id === task.assignee_id;

  // Check if task is overdue (past deadline and not yet Completed)
  const isOverdue =
    new Date(task.max_deadline) < new Date() && task.status !== "Completed";

  // Calculate days until/since deadline
  const now = Date.now();
  const daysRemaining = Math.ceil(
    (new Date(task.max_deadline).getTime() - now) / (1000 * 60 * 60 * 24)
  );

  // Sub-task completion progress
  const totalSubTasks = task.sub_tasks?.length || 0;
  const completedSubTasks =
    task.sub_tasks?.filter((st) => st.status === "Completed").length || 0;

  // Determine the display multiplier for completed tasks
  const displayMultiplier =
    task.status === "Completed"
      ? task.multiplier_earned ??
        getMultiplier(task.completed_at || new Date().toISOString(), task.max_deadline).multiplier
      : null;

  // Status color dot
  const getStatusDotColor = (status: TaskStatus): string => {
    switch (status) {
      case "Todo": return "#91918e";
      case "In Progress": return "#337ea9";
      case "In Review": return "#cb912f";
      case "Completed": return "#448361";
      default: return "#91918e";
    }
  };

  // Priority badge style
  const getPriorityClass = (priority: TaskPriority | null): string => {
    switch (priority) {
      case "High": return "priority-high";
      case "Medium": return "priority-medium";
      case "Low": return "priority-low";
      default: return "";
    }
  };

  // 1. Handle status change
  const handleStatusChange = async (newStatus: TaskStatus) => {
    try {
      setLoading(true);
      const updateData: Record<string, any> = { task_id: task.task_id, status: newStatus };

      if (newStatus === "Completed") {
        const completedAt = new Date().toISOString();
        const { multiplier } = getMultiplier(completedAt, task.max_deadline);
        updateData.multiplier_earned = multiplier;
      }

      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to update status");
      }

      // If moved to 'In Review', trigger notification
      if (newStatus === "In Review") {
        fetch("/api/notify-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskTitle: task.title,
            assigneeName: assignee?.full_name || "Unknown",
            estimatedDays: task.estimated_days,
          }),
        }).catch(console.error);
      }

      onUpdate();
    } catch (err: any) {
      console.error("Error updating status:", err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Handle description update
  const handleDescriptionSave = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: task.task_id,
          description,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to update description");
      }

      setEditing(false);
      onUpdate();
    } catch (err: any) {
      console.error("Error saving description:", err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle task deletion (Admin only)
  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/tasks?id=${task.task_id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to delete task");
      }
      onUpdate();
    } catch (err: any) {
      console.error("Error deleting task:", err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Determine which status transitions are allowed per role
  const getAllowedTransitions = (): TaskStatus[] => {
    if (isAdmin) {
      return ["Todo", "In Progress", "In Review", "Completed"];
    }
    if (!isOwnTask) return [];
    switch (task.status) {
      case "Todo":
        return ["In Progress"];
      case "In Progress":
        return ["In Review"];
      default:
        return [];
    }
  };

  const allowedTransitions = getAllowedTransitions().filter(
    (s) => s !== task.status
  );

  // Assignee initials
  const initials = assignee?.full_name
    ? assignee.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const canExpand = isAdmin || isOwnTask;

  return (
    <>
      {/* Main row */}
      <tr
        className={`group transition-colors cursor-pointer ${
          expanded ? "bg-warm-50" : "hover:bg-neutral-50/80"
        } ${isOverdue ? "bg-red-50/30" : ""}`}
        onClick={() => canExpand && setExpanded(!expanded)}
      >
        {/* Title */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            {canExpand && (
              <span className="text-neutral-400 shrink-0">
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}
            <span className="text-sm font-medium text-neutral-800 truncate max-w-[250px]">
              {task.title}
            </span>
            {isOverdue && (
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
            )}
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: getStatusDotColor(task.status) }}
            />
            <span className="text-xs text-neutral-600">{task.status}</span>
          </div>
        </td>

        {/* Assignee */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-warm-400/15 flex items-center justify-center shrink-0">
              <span className="text-[8px] font-bold text-warm-400">{initials}</span>
            </div>
            <span className="text-xs text-neutral-600 truncate max-w-[100px]">
              {assignee?.full_name || "Unassigned"}
            </span>
          </div>
        </td>

        {/* Priority */}
        <td className="px-3 py-2.5">
          {task.priority ? (
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${getPriorityClass(task.priority as any)}`}>
              {task.priority}
            </span>
          ) : (
            <span className="text-xs text-neutral-300">-</span>
          )}
        </td>

        {/* Deadline */}
        <td className="px-3 py-2.5">
          <span className={`text-xs ${isOverdue ? "text-red-500 font-medium" : "text-neutral-500"}`}>
            {daysRemaining > 0
              ? `${daysRemaining}d left`
              : daysRemaining === 0
              ? "Due today"
              : `${Math.abs(daysRemaining)}d overdue`}
          </span>
        </td>

        {/* Progress (sub-tasks) */}
        <td className="px-3 py-2.5">
          {totalSubTasks > 0 ? (
            <div className="flex items-center gap-1.5">
              <div className="w-12 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(completedSubTasks / totalSubTasks) * 100}%`,
                    background: "#448361",
                  }}
                />
              </div>
              <span className="text-[10px] text-neutral-400">
                {completedSubTasks}/{totalSubTasks}
              </span>
            </div>
          ) : (
            <span className="text-xs text-neutral-300">-</span>
          )}
        </td>

        {/* Multiplier (for completed) */}
        <td className="px-3 py-2.5 text-right">
          {displayMultiplier !== null ? (
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${
              displayMultiplier >= 1.0
                ? "bg-green-50 text-green-600"
                : displayMultiplier >= 0.6
                ? "bg-amber-50 text-amber-600"
                : displayMultiplier >= 0.4
                ? "bg-orange-50 text-orange-600"
                : "bg-red-50 text-red-500"
            }`}>
              <Zap size={9} />
              {displayMultiplier}x
            </span>
          ) : (
            <span className="text-xs text-neutral-300">-</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5 text-right">
          {isAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              disabled={loading}
              className="p-1 rounded text-neutral-300 hover:text-red-400 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          )}
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="bg-warm-50/60">
          <td colSpan={8} className="px-6 py-4 animate-fade-in">
            <div className="space-y-4 max-w-2xl ml-6">
              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider">
                    Description
                  </span>
                  {(isAdmin || isOwnTask) &&
                    task.status !== "In Review" &&
                    task.status !== "Completed" && (
                      <button
                        onClick={() => setEditing(!editing)}
                        className="text-neutral-400 hover:text-warm-400 transition-colors"
                      >
                        <Edit3 size={12} />
                      </button>
                    )}
                </div>
                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="glass-input text-xs min-h-[60px] resize-none"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleDescriptionSave}
                        disabled={loading}
                        className="btn-primary text-xs py-1.5 px-3"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditing(false);
                          setDescription(task.description);
                        }}
                        className="btn-ghost text-xs py-1.5 px-3"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    {task.description || "No description provided."}
                  </p>
                )}
              </div>

              {/* Sub-tasks list */}
              {task.sub_tasks && task.sub_tasks.length > 0 && (
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider">
                    Sub-tasks
                  </span>
                  <div className="mt-1.5 space-y-1">
                    {task.sub_tasks.map((st) => (
                      <div
                        key={st.id}
                        className="flex items-center gap-2 py-1 text-sm"
                      >
                        {st.status === "Completed" ? (
                          <CheckCircle2
                              size={14}
                              className="text-green-500 shrink-0"
                            />
                        ) : (
                          <Circle
                            size={14}
                            className="text-neutral-300 shrink-0"
                          />
                        )}
                        <span
                          className={
                            st.status === "Completed"
                              ? "text-neutral-400 line-through"
                              : "text-neutral-700"
                          }
                        >
                          {st.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status transition buttons */}
              {allowedTransitions.length > 0 && (
                <div className="flex gap-2 flex-wrap pt-1">
                  {allowedTransitions.map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      disabled={loading}
                      className="btn-ghost text-xs py-1.5 px-3"
                    >
                      Move to {status}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
