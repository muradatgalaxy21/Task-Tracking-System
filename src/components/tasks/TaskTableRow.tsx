"use client";

// Task table row — clicking the row opens the Deep Dive side panel.
// Delete button (admin only) is the only action performed inline.

import type { TaskLedger, Profile, TaskStatus, TaskPriority } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { getMultiplier } from "@/lib/calculations";
import { getDeadlineInfo } from "@/lib/deadline-utils";
import { useState } from "react";
import { Trash2, AlertTriangle, Zap, Clock } from "lucide-react";
import UserAvatar from "@/components/common/UserAvatar";

interface TaskTableRowProps {
  task: TaskLedger;
  members: Profile[];
  onUpdate: () => void;
  onOpenPanel: (task: TaskLedger) => void;
  isSelected?: boolean;
}

export default function TaskTableRow({ task, members, onUpdate, onOpenPanel, isSelected = false }: TaskTableRowProps) {
  const { isWorkspaceAdmin } = useWorkspace();
  const [loading, setLoading] = useState(false);

  // Inline auth for delete: admins always, assignees only when task is not locked
  const isTerminal = ["Completed", "Not Done", "Discarded"].includes(task.status);
  const isLocked   = ["In Review", "Completed", "Not Done", "Discarded"].includes(task.status);
  const canDelete = isWorkspaceAdmin;

  const assignee = members.find((m) => m.id === task.assignee_id);

  const deadline = getDeadlineInfo(task.max_deadline);
  const showDeadlineColor = !isTerminal;

  const totalSubTasks = task.sub_tasks?.length || 0;
  const completedSubTasks =
    task.sub_tasks?.filter((st) => st.status === "Completed").length || 0;

  // Show multiplier for both Completed and Not Done tasks
  const displayMultiplier =
    (task.status === "Completed" || task.status === "Not Done")
      ? (task.multiplier_earned ??
          getMultiplier(
            task.completed_at || new Date().toISOString(),
            task.max_deadline,
            task.review_submitted_at
          ).multiplier)
      : null;

  const getStatusDotColor = (status: TaskStatus): string => {
    switch (status) {
      case "Todo":        return "#91918e";
      case "In Progress": return "#337ea9";
      case "In Review":   return "#cb912f";
      case "Completed":   return "#448361";
      case "Not Done":    return "#dc2626";
      case "Discarded":   return "#b0a9a2";
      default:            return "#91918e";
    }
  };

  const getPriorityClass = (priority: TaskPriority | null): string => {
    switch (priority) {
      case "Urgent": return "priority-urgent";
      case "High":   return "priority-high";
      case "Medium": return "priority-medium";
      case "Low":    return "priority-low";
      default:       return "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this task?")) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/tasks?id=${task.task_id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
      onUpdate();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setLoading(false);
    }
  };



  // Selected state reuses the same deep-dark treatment as hover so the open
  // panel always has a clear visual anchor on the row that triggered it.
  const selectedClasses = isSelected
    ? "dark:bg-[#050508] dark:outline dark:outline-1 dark:outline-zinc-700"
    : "";

  return (
    <tr
      className={`group cursor-pointer transition-all duration-150
        hover:bg-neutral-50
        dark:bg-white/[0.015]
        dark:hover:bg-[#050508] dark:hover:outline dark:hover:outline-1 dark:hover:outline-zinc-700
        ${selectedClasses}
        ${showDeadlineColor && deadline.isOverdue ? "bg-red-50/30 dark:bg-red-950/20" : ""}
      `}
      onClick={() => onOpenPanel(task)}
    >
      {/* Title */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-800 truncate max-w-[250px]">
            {task.title}
          </span>
          {showDeadlineColor && deadline.isOverdue && <AlertTriangle size={13} className="text-red-400 shrink-0" />}
        </div>
      </td>

      {/* Status */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: getStatusDotColor(task.status) }}
          />
          <span className="text-xs text-neutral-600">
            {STATUS_LABELS[task.status] ?? task.status}
          </span>
        </div>
      </td>

      {/* Assignee */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <UserAvatar
            fullName={assignee?.full_name}
            image={assignee?.image}
            size={20}
            className="rounded"
          />
          <span className="text-xs text-neutral-600 truncate max-w-[100px]">
            {assignee?.full_name || "Unassigned"}
          </span>
        </div>
      </td>

      {/* Priority */}
      <td className="px-3 py-2.5">
        {task.priority ? (
          <span
            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${getPriorityClass(
              task.priority as TaskPriority
            )}`}
          >
            {task.priority}
          </span>
        ) : (
          <span className="text-xs text-neutral-300">-</span>
        )}
      </td>

      {/* Deadline */}
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${
            showDeadlineColor
              ? `${deadline.colorClass} ${deadline.bgClass}`
              : "text-neutral-500"
          }`}
        >
          {showDeadlineColor && deadline.isOverdue && <AlertTriangle size={10} />}
          {showDeadlineColor ? deadline.label : new Date(task.max_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </td>

      {/* Progress */}
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

      {/* Multiplier */}
      <td className="px-3 py-2.5 text-right">
        {displayMultiplier !== null ? (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${
              displayMultiplier >= 1.0
                ? "bg-green-50 text-green-600"
                : displayMultiplier >= 0.6
                ? "bg-amber-50 text-amber-600"
                : displayMultiplier >= 0.4
                ? "bg-orange-50 text-orange-600"
                : "bg-red-50 text-red-500"
            }`}
          >
            <Zap size={9} />
            {displayMultiplier}x
          </span>
        ) : (
          <span className="text-xs text-neutral-300">-</span>
        )}
      </td>

      {/* Delete action — shown to admins always, the panel handles fine-grained assignee deletes */}
      <td className="px-3 py-2.5 text-right">
        {canDelete && (
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
  );
}
