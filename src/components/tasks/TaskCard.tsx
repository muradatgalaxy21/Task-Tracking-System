"use client";

// Kanban task card — clicking the card opens the Deep Dive panel.

import { useState } from "react";
import type { TaskLedger, Profile } from "@/lib/types";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { getMultiplier } from "@/lib/calculations";
import {
  Clock,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Link2,
  Cpu,
  BarChart2,
} from "lucide-react";

interface TaskCardProps {
  task: TaskLedger;
  members: Profile[];
  onUpdate: () => void;
  onOpenPanel: (task: TaskLedger) => void;
}

const PRIORITY_CLASS: Record<string, string> = {
  Urgent: "priority-urgent",
  High: "priority-high",
  Medium: "priority-medium",
  Low: "priority-low",
};

export default function TaskCard({ task, members, onUpdate, onOpenPanel }: TaskCardProps) {
  const { user } = useAuth();
  const { isWorkspaceAdmin, isWorkspaceManager } = useWorkspace();
  const [loading, setLoading] = useState(false);

  const assignee  = members.find((m) => m.id === task.assignee_id);
  const isLocked  = ["In Review", "Completed", "Discarded"].includes(task.status);
  // Admins can always delete; Managers can delete their own unlocked tasks; Members cannot delete
  const canDelete = isWorkspaceAdmin || (isWorkspaceManager && user?.id === task.assignee_id && !isLocked);

  const isDiscarded = task.status === "Discarded";
  const isOverdue   =
    new Date(task.max_deadline) < new Date() &&
    task.status !== "Completed" &&
    task.status !== "Discarded";

  const daysRemaining = Math.ceil(
    (new Date(task.max_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const totalSubTasks = task.sub_tasks?.length || 0;
  const completedSubTasks =
    task.sub_tasks?.filter((st) => st.status === "Completed").length || 0;

  const displayMultiplier =
    task.status === "Completed"
      ? (task.multiplier_earned ??
          getMultiplier(
            task.completed_at || new Date().toISOString(),
            task.max_deadline
          ).multiplier)
      : null;

  const multiplierColorClass =
    displayMultiplier === null
      ? ""
      : displayMultiplier >= 1.0
      ? "text-emerald-600"
      : displayMultiplier >= 0.6
      ? "text-amber-600"
      : "text-red-500";

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

  const initials = assignee?.full_name
    ? assignee.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div
      className={`glass-card-hover p-3.5 space-y-2.5 cursor-pointer ${
        isOverdue ? "border-red-300/60" : ""
      } ${isDiscarded ? "opacity-60" : ""}`}
      onClick={() => onOpenPanel(task)}
    >
      {/* Header: title + delete */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-neutral-800 leading-snug flex-1">
          {task.title}
        </span>
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            disabled={loading}
            className="p-1 rounded text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Deadline + sub-task progress + multiplier */}
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`flex items-center gap-1 text-xs ${
            isOverdue ? "text-red-500 font-medium" : "text-neutral-400"
          }`}
        >
          {isOverdue ? <AlertTriangle size={11} /> : <Clock size={11} />}
          {daysRemaining > 0
            ? `${daysRemaining}d left`
            : daysRemaining === 0
            ? "Due today"
            : `${Math.abs(daysRemaining)}d overdue`}
        </span>

        {totalSubTasks > 0 && (
          <span className="flex items-center gap-1 text-xs text-neutral-400">
            <CheckCircle2 size={11} />
            {completedSubTasks}/{totalSubTasks}
          </span>
        )}

        {displayMultiplier !== null && (
          <span
            className={`flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded bg-neutral-50 border border-neutral-100 ${multiplierColorClass}`}
          >
            <Zap size={9} />
            {displayMultiplier}x
          </span>
        )}
      </div>

      {/* Assignee + priority */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-warm-400/15 flex items-center justify-center">
            <span className="text-[9px] font-bold text-warm-400">{initials}</span>
          </div>
          <span className="text-xs text-neutral-500 truncate max-w-[90px]">
            {assignee?.full_name || "Unassigned"}
          </span>
        </div>
        {task.priority && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              PRIORITY_CLASS[task.priority] || ""
            }`}
          >
            {task.priority}
          </span>
        )}
      </div>

      {/* Technical metadata chips */}
      {(task.ai_model_used || task.repo_link) && (
        <div className="flex flex-wrap gap-1.5">
          {task.ai_model_used && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
              <Cpu size={9} />
              {task.ai_model_used}
            </span>
          )}
          {task.repo_link && (
            <a
              href={task.repo_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-neutral-50 text-neutral-500 border border-neutral-100 hover:text-warm-400 transition-colors"
            >
              <Link2 size={9} />
              Repo
            </a>
          )}
          {task.benchmark_score && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-100">
              <BarChart2 size={9} />
              {task.benchmark_score}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
