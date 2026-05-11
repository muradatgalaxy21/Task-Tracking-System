"use client";

// -------------------------------------------------------------------
// Task Card Component
// Displays a single task in the Kanban board with status, assignee
// info, deadline, sub-task progress, and earned multiplier.
// Points display removed; multiplier_earned is stored in DB on completion.
// -------------------------------------------------------------------

import { useState } from "react";
import type { TaskLedger, Profile, TaskStatus } from "@/lib/types";
import { useAuth } from "@/components/providers/AuthProvider";
import { getMultiplier } from "@/lib/calculations";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  Edit3,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Zap,
} from "lucide-react";

interface TaskCardProps {
  task: TaskLedger;
  members: Profile[];
  onUpdate: () => void;
}

export default function TaskCard({ task, members, onUpdate }: TaskCardProps) {
  const { isAdmin, user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(task.description);
  const [loading, setLoading] = useState(false);

  // Find the assignee name
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

  const multiplierColorClass =
    displayMultiplier === null
      ? ""
      : displayMultiplier >= 1.0
      ? "text-emerald-400"
      : displayMultiplier >= 0.6
      ? "text-amber-400"
      : displayMultiplier >= 0.4
      ? "text-orange-400"
      : "text-rose-400";

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

  return (
    <div
      className={`glass-card-hover p-4 space-y-3 ${
        isOverdue ? "border-rose-500/30" : ""
      }`}
    >
      {/* Header: Title + Actions */}
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-white leading-snug flex-1">
          {task.title}
        </h4>
        <div className="flex items-center gap-1 shrink-0">
          {(isAdmin || isOwnTask) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`flex items-center gap-1 text-xs ${
            isOverdue ? "text-rose-400" : "text-slate-500"
          }`}
        >
          {isOverdue ? <AlertTriangle size={12} /> : <Clock size={12} />}
          {daysRemaining > 0
            ? `${daysRemaining}d left`
            : daysRemaining === 0
            ? "Due today"
            : `${Math.abs(daysRemaining)}d overdue`}
        </span>

        {totalSubTasks > 0 && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <CheckCircle2 size={12} />
            {completedSubTasks}/{totalSubTasks}
          </span>
        )}

        {displayMultiplier !== null && (
          <span
            className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-white/5 ${multiplierColorClass}`}
          >
            <Zap size={10} />
            {displayMultiplier}x
          </span>
        )}
      </div>

      {/* Assignee */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-accent-blue/15 flex items-center justify-center">
          <span className="text-[9px] font-bold text-blue-400">
            {assignee?.full_name
              ? assignee.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)
              : "?"}
          </span>
        </div>
        <span className="text-xs text-slate-400">
          {assignee?.full_name || "Unassigned"}
        </span>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="pt-2 border-t border-white/5 space-y-3 animate-fade-in">
          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-600 uppercase font-semibold tracking-wider">
                Description
              </span>
              {(isAdmin || isOwnTask) &&
                task.status !== "In Review" &&
                task.status !== "Completed" && (
                  <button
                    onClick={() => setEditing(!editing)}
                    className="text-slate-500 hover:text-blue-400 transition-colors"
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
              <p className="text-xs text-slate-400 leading-relaxed">
                {task.description || "No description provided."}
              </p>
            )}
          </div>

          {/* Sub-tasks list */}
          {task.sub_tasks && task.sub_tasks.length > 0 && (
            <div>
              <span className="text-[10px] text-slate-600 uppercase font-semibold tracking-wider">
                Sub-tasks
              </span>
              <div className="mt-1 space-y-1">
                {task.sub_tasks.map((st) => (
                  <div
                    key={st.id}
                    className="flex items-center gap-2 py-1 text-xs"
                  >
                    {st.status === "Completed" ? (
                      <CheckCircle2
                        size={14}
                        className="text-emerald-400 shrink-0"
                      />
                    ) : (
                      <Circle
                        size={14}
                        className="text-slate-600 shrink-0"
                      />
                    )}
                    <span
                      className={
                        st.status === "Completed"
                          ? "text-slate-500 line-through"
                          : "text-slate-300"
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
            <div className="flex gap-2 flex-wrap">
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
      )}
    </div>
  );
}
