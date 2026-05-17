"use client";

import { useState, useEffect, useCallback } from "react";
import type { TaskLedger, Profile, TaskStatus, TaskAttachment } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { getMultiplier } from "@/lib/calculations";
import ActivityFeed from "@/components/tasks/ActivityFeed";
import {
  X,
  Edit3,
  Clock,
  AlertTriangle,
  Link2,
  Plus,
  Trash2,
  Cpu,
  BarChart2,
  Zap,
  ExternalLink,
  CheckCircle2,
  Circle,
  Lock,
} from "lucide-react";

// ---- Minimal inline markdown renderer ---- //

function renderInline(text: string): React.ReactNode {
  const tokens: React.ReactNode[] = [];
  // Groups: 1=bold content, 2=code content, 3=italic content
  const regex = /\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      tokens.push(
        <strong key={match.index} className="font-semibold text-neutral-800">
          {match[1]}
        </strong>
      );
    } else if (match[2] !== undefined) {
      tokens.push(
        <code
          key={match.index}
          className="px-1 py-0.5 bg-neutral-100 rounded text-[11px] font-mono text-neutral-700 border border-neutral-200"
        >
          {match[2]}
        </code>
      );
    } else if (match[3] !== undefined) {
      tokens.push(<em key={match.index}>{match[3]}</em>);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
  return <>{tokens}</>;
}

function MarkdownText({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  return (
    <div className={`space-y-0.5 ${className ?? ""}`}>
      {lines.map((line, i) => {
        if (line.startsWith("# ")) {
          return (
            <div key={i} className="text-sm font-semibold text-neutral-800 mt-2 first:mt-0">
              {renderInline(line.slice(2))}
            </div>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <div key={i} className="text-xs font-semibold text-neutral-700 mt-1.5 first:mt-0">
              {renderInline(line.slice(3))}
            </div>
          );
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <div key={i} className="flex items-start gap-1.5">
              <span className="mt-[6px] w-1 h-1 rounded-full bg-neutral-400 shrink-0" />
              <span className="text-xs text-neutral-600">{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (line === "") return <div key={i} className="h-1.5" />;
        return (
          <div key={i} className="text-xs text-neutral-600 leading-relaxed">
            {renderInline(line)}
          </div>
        );
      })}
    </div>
  );
}

// ---- Editable text block (multi-line) ---- //

interface EditableBlockProps {
  label: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  placeholder: string;
  canEdit: boolean;
  saving: boolean;
}

function EditableBlock({ label, value, onSave, placeholder, canEdit, saving }: EditableBlockProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider">
          {label}
        </span>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-neutral-400 hover:text-warm-400 transition-colors"
          >
            <Edit3 size={12} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="glass-input text-xs min-h-[80px] resize-none font-mono"
            rows={5}
            placeholder={placeholder}
            autoFocus
          />
          <div className="flex gap-2 items-center">
            <button
              onClick={async () => {
                await onSave(draft);
                setEditing(false);
              }}
              disabled={saving}
              className="btn-primary text-xs py-1.5 px-3"
            >
              Save
            </button>
            <button
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
              className="btn-ghost text-xs py-1.5 px-3"
            >
              Cancel
            </button>
            <span className="text-[10px] text-neutral-400">Markdown supported</span>
          </div>
        </div>
      ) : value ? (
        <MarkdownText text={value} />
      ) : (
        <p
          className={`text-xs text-neutral-400 italic ${canEdit ? "cursor-pointer hover:text-neutral-500" : ""}`}
          onClick={() => canEdit && setEditing(true)}
        >
          {placeholder}
        </p>
      )}
    </div>
  );
}

// ---- Inline number input (click-to-edit) ---- //

interface InlineNumberFieldProps {
  value: number | null | undefined;
  canEdit: boolean;
  onSave: (value: number | null) => void;
  saving: boolean;
}

function InlineNumberField({ value, canEdit, onSave, saving }: InlineNumberFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");

  useEffect(() => {
    if (!editing) setDraft(value?.toString() ?? "");
  }, [value, editing]);

  const commit = () => {
    const num = parseFloat(draft);
    onSave(draft.trim() === "" ? null : isNaN(num) ? null : num);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-20 glass-input text-xs py-0.5 px-2"
        step="0.5"
        min="0"
        autoFocus
        disabled={saving}
      />
    );
  }

  return (
    <button
      onClick={() => canEdit && setEditing(true)}
      className={`text-xs ${
        value != null ? "text-neutral-700" : "text-neutral-400 italic"
      } ${canEdit ? "hover:text-warm-400 cursor-text" : "cursor-default"}`}
    >
      {value != null ? `${value}h` : "Not set"}
    </button>
  );
}

// ---- Inline title editor (Manager+) ---- //

function TitleEditor({
  value,
  onSave,
  saving,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (editing) {
    return (
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && draft.trim()) {
              await onSave(draft.trim());
              setEditing(false);
            }
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="glass-input text-sm font-semibold py-1 flex-1 min-w-0"
          disabled={saving}
          autoFocus
        />
        <button
          onClick={async () => {
            if (draft.trim()) {
              await onSave(draft.trim());
              setEditing(false);
            }
          }}
          disabled={saving || !draft.trim()}
          className="btn-primary text-xs py-1 px-2 shrink-0"
        >
          Save
        </button>
        <button
          onClick={() => { setDraft(value); setEditing(false); }}
          className="btn-ghost text-xs py-1 px-2 shrink-0"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-base font-semibold text-neutral-800 leading-snug pr-2 text-left hover:text-warm-400 transition-colors group flex items-start gap-1"
      title="Click to edit title"
    >
      {value}
      <Edit3 size={11} className="shrink-0 mt-1 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

// ---- Delete button for panel header ---- //

function DeleteButton({
  taskId,
  onDeleted,
  onUpdate,
}: {
  taskId: string;
  onDeleted: () => void;
  onUpdate: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
      onUpdate();
      onDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      title="Delete task"
      className="p-1.5 rounded text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-all"
    >
      <Trash2 size={15} />
    </button>
  );
}

// ---- Priority class map ---- //
const PRIORITY_CLASS: Record<string, string> = {
  Urgent: "priority-urgent",
  High: "priority-high",
  Medium: "priority-medium",
  Low: "priority-low",
};

// ---- Main panel component ---- //

interface TaskDetailPanelProps {
  task: TaskLedger;
  members: Profile[];
  onClose: () => void;
  onUpdate: () => void;
}

export default function TaskDetailPanel({ task, members, onClose, onUpdate }: TaskDetailPanelProps) {
  const { user } = useAuth();
  const { isWorkspaceAdmin, isWorkspaceManager } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [showAttachmentForm, setShowAttachmentForm] = useState(false);
  const [attachName, setAttachName] = useState("");
  const [attachUrl, setAttachUrl] = useState("");

  const isOwnTask  = user?.id === task.assignee_id;
  // Review lock: once In Review only Admins can modify anything
  const isReviewLocked = task.status === "In Review" && !isWorkspaceAdmin;

  // Title editing requires Manager or above
  const canEditTitle    = !isReviewLocked && isWorkspaceManager;
  // Metadata (description, notes, attachments) can be edited by the assignee if Member+, or Admin
  const canEditMetadata = !isReviewLocked && (isWorkspaceAdmin || isOwnTask);

  // Admins can always delete; Managers can delete their own unlocked tasks.
  // Members cannot delete tasks at all.
  const isLocked    = ["In Review", "Completed", "Discarded"].includes(task.status);
  const isDeletable = isWorkspaceAdmin || (isWorkspaceManager && isOwnTask && !isLocked);

  // Legacy canEdit alias used by existing sub-components (metadata scope)
  const canEdit = canEditMetadata;

  const assignee = members.find((m) => m.id === task.assignee_id);
  const initials = assignee?.full_name
    ? assignee.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const isOverdue = new Date(task.max_deadline) < new Date() && task.status !== "Completed";
  const daysRemaining = Math.ceil(
    (new Date(task.max_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const taskDisplayId = `AB-${task.task_id.slice(0, 6).toUpperCase()}`;

  const attachments: TaskAttachment[] = (() => {
    try {
      return JSON.parse(task.attachments || "[]");
    } catch {
      return [];
    }
  })();

  const displayMultiplier =
    task.status === "Completed"
      ? (task.multiplier_earned ??
          getMultiplier(task.completed_at || new Date().toISOString(), task.max_deadline).multiplier)
      : null;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const saveField = useCallback(
    async (field: string, value: unknown) => {
      setSaving(true);
      try {
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: task.task_id, [field]: value }),
        });
        if (!res.ok) throw new Error("Save failed");
        onUpdate();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [task.task_id, onUpdate]
  );

  const handleStatusChange = async (newStatus: TaskStatus) => {
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = { task_id: task.task_id, status: newStatus };
      if (newStatus === "Completed") {
        const { multiplier } = getMultiplier(new Date().toISOString(), task.max_deadline);
        updateData.multiplier_earned = multiplier;
      }
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const getAllowedTransitions = (): TaskStatus[] => {
    // Admins can move to any status including terminal ones
    if (isWorkspaceAdmin) return ["Todo", "In Progress", "In Review", "Completed", "Discarded"];
    // Non-owners/admins cannot advance from terminal states
    if (!isOwnTask) return [];
    switch (task.status) {
      case "Todo":        return ["In Progress"];
      case "In Progress": return ["In Review"];
      // Members/Managers cannot self-transition from review or terminal states
      default:            return [];
    }
  };
  const allowedTransitions = getAllowedTransitions().filter((s) => s !== task.status);

  const handleAddAttachment = async () => {
    if (!attachName.trim() || !attachUrl.trim()) return;
    const next = [...attachments, { name: attachName.trim(), url: attachUrl.trim() }];
    await saveField("attachments", JSON.stringify(next));
    setAttachName("");
    setAttachUrl("");
    setShowAttachmentForm(false);
  };

  const handleRemoveAttachment = async (index: number) => {
    await saveField("attachments", JSON.stringify(attachments.filter((_, i) => i !== index)));
  };

  const statusBadgeClass = {
    "Todo":        "bg-neutral-100 text-neutral-500 border-neutral-200",
    "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
    "In Review":   "bg-amber-50 text-amber-700 border-amber-200",
    "Completed":   "bg-green-50 text-green-700 border-green-200",
    "Discarded":   "bg-neutral-100 text-neutral-400 border-neutral-200",
  }[task.status] ?? "bg-neutral-100 text-neutral-500 border-neutral-200";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Sliding drawer */}
      <div
        className="fixed right-0 top-0 h-full w-full sm:w-[560px] bg-white z-50 flex flex-col shadow-2xl border-l border-neutral-200 animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- Sticky header ---- */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-neutral-100 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {/* Stable short ID */}
              <span className="text-[11px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded tracking-wide">
                {taskDisplayId}
              </span>

              {/* Status — picker if transitions available, badge if not */}
              {allowedTransitions.length > 0 ? (
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                  disabled={saving}
                  className={`text-[11px] font-medium px-2 py-0.5 rounded border cursor-pointer focus:outline-none focus:border-warm-400 transition-colors appearance-none ${statusBadgeClass}`}
                >
                  {(["Todo", "In Progress", "In Review", "Completed"] as TaskStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s] ?? s}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${statusBadgeClass}`}>
                  {STATUS_LABELS[task.status] ?? task.status}
                </span>
              )}

              {displayMultiplier !== null && (
                <span
                  className={`flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                    displayMultiplier >= 1.0
                      ? "text-emerald-600 bg-emerald-50"
                      : displayMultiplier >= 0.6
                      ? "text-amber-600 bg-amber-50"
                      : "text-red-500 bg-red-50"
                  }`}
                >
                  <Zap size={10} />
                  {displayMultiplier}x
                </span>
              )}
            </div>

            {/* Title — editable for Managers and above */}
            {canEditTitle ? (
              <TitleEditor
                value={task.title}
                onSave={(v) => saveField("title", v)}
                saving={saving}
              />
            ) : (
              <h2 className="text-base font-semibold text-neutral-800 leading-snug pr-2">
                {task.title}
              </h2>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            {/* Delete button — available to assignees (when not locked) and admins */}
            {isDeletable && (
              <DeleteButton taskId={task.task_id} onDeleted={onClose} onUpdate={onUpdate} />
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Review lock banner — shown to Members when task is In Review */}
        {isReviewLocked && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 shrink-0">
            <Lock size={12} className="shrink-0" />
            This task is locked for review. Only Admins can make changes.
          </div>
        )}

        {/* ---- Scrollable body ---- */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-6">

            {/* ---- Meta fields ---- */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-medium w-24 shrink-0">
                  Assignee
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded bg-warm-400/15 flex items-center justify-center shrink-0">
                    <span className="text-[8px] font-bold text-warm-400">{initials}</span>
                  </div>
                  <span className="text-xs text-neutral-700">
                    {assignee?.full_name || "Unassigned"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-medium w-24 shrink-0">
                  Priority
                </span>
                {task.priority ? (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_CLASS[task.priority] ?? ""}`}
                  >
                    {task.priority}
                  </span>
                ) : (
                  <span className="text-xs text-neutral-400">Not set</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-medium w-24 shrink-0">
                  Deadline
                </span>
                <span
                  className={`flex items-center gap-1 text-xs ${
                    isOverdue ? "text-red-500 font-medium" : "text-neutral-700"
                  }`}
                >
                  {isOverdue ? <AlertTriangle size={11} /> : <Clock size={11} />}
                  {/* Show date and time if a non-midnight time was set */}
                  {new Date(task.max_deadline).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  <span className="text-neutral-400">
                    {isOverdue
                      ? ` (${Math.abs(daysRemaining)}d overdue)`
                      : daysRemaining === 0
                      ? " (today)"
                      : ` (${daysRemaining}d left)`}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-medium w-24 shrink-0">
                  Est. Hours
                </span>
                <InlineNumberField
                  value={task.estimated_hours}
                  canEdit={canEdit}
                  onSave={(v) => saveField("estimated_hours", v)}
                  saving={saving}
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-medium w-24 shrink-0">
                  Actual Hours
                </span>
                <InlineNumberField
                  value={task.actual_hours}
                  canEdit={canEdit}
                  onSave={(v) => saveField("actual_hours", v)}
                  saving={saving}
                />
              </div>
            </div>

            <div className="border-t border-neutral-100" />

            {/* ---- Description ---- */}
            <EditableBlock
              label="Description"
              value={task.description}
              onSave={(v) => saveField("description", v)}
              placeholder="Add a description..."
              canEdit={canEdit}
              saving={saving}
            />

            {/* ---- Technical Requirements ---- */}
            <EditableBlock
              label="Technical Requirements"
              value={task.technical_requirements || ""}
              onSave={(v) => saveField("technical_requirements", v)}
              placeholder="APIs, models, input/output formats, performance constraints..."
              canEdit={canEdit}
              saving={saving}
            />

            {/* ---- Architecture Notes ---- */}
            <EditableBlock
              label="Architecture Notes"
              value={task.architecture_notes || ""}
              onSave={(v) => saveField("architecture_notes", v)}
              placeholder="System design, data flow, component interactions..."
              canEdit={canEdit}
              saving={saving}
            />

            {/* ---- AI & Technical Metadata chips ---- */}
            {(task.ai_model_used || task.benchmark_score || task.repo_link) && (
              <>
                <div className="border-t border-neutral-100" />
                <div>
                  <span className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider">
                    AI Metadata
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {task.ai_model_used && (
                      <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-blue-50 text-blue-600 border border-blue-100">
                        <Cpu size={10} />
                        {task.ai_model_used}
                      </span>
                    )}
                    {task.benchmark_score && (
                      <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-green-50 text-green-700 border border-green-100">
                        <BarChart2 size={10} />
                        Score: {task.benchmark_score}
                      </span>
                    )}
                    {task.repo_link && (
                      <a
                        href={task.repo_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-neutral-50 text-neutral-600 border border-neutral-200 hover:text-warm-400 hover:border-warm-200 transition-colors"
                      >
                        <Link2 size={10} />
                        Repository
                        <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ---- Sub-tasks ---- */}
            {task.sub_tasks && task.sub_tasks.length > 0 && (
              <>
                <div className="border-t border-neutral-100" />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider">
                      Sub-tasks
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      {task.sub_tasks.filter((s) => s.status === "Completed").length}/
                      {task.sub_tasks.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {task.sub_tasks.map((st) => (
                      <div key={st.id} className="flex items-center gap-2 text-xs">
                        {st.status === "Completed" ? (
                          <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                        ) : (
                          <Circle size={14} className="text-neutral-300 shrink-0" />
                        )}
                        <span
                          className={
                            st.status === "Completed"
                              ? "line-through text-neutral-400"
                              : "text-neutral-700"
                          }
                        >
                          {st.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ---- Attachments & Links ---- */}
            <div className="border-t border-neutral-100" />
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider">
                  Attachments & Links
                </span>
                {canEdit && (
                  <button
                    onClick={() => setShowAttachmentForm(!showAttachmentForm)}
                    className="text-neutral-400 hover:text-warm-400 transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                )}
              </div>

              {attachments.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-2 group">
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-warm-400 transition-colors flex-1 min-w-0"
                      >
                        <Link2 size={11} className="shrink-0" />
                        <span className="truncate">{att.name}</span>
                        <ExternalLink size={9} className="shrink-0 text-neutral-400" />
                      </a>
                      {canEdit && (
                        <button
                          onClick={() => handleRemoveAttachment(i)}
                          className="p-0.5 text-neutral-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showAttachmentForm && (
                <div className="space-y-2 p-3 bg-neutral-50 rounded-lg border border-neutral-200 animate-fade-in">
                  <input
                    type="text"
                    value={attachName}
                    onChange={(e) => setAttachName(e.target.value)}
                    placeholder="Label (e.g. Architecture Diagram)"
                    className="glass-input text-xs py-1.5"
                  />
                  <input
                    type="url"
                    value={attachUrl}
                    onChange={(e) => setAttachUrl(e.target.value)}
                    placeholder="https://..."
                    className="glass-input text-xs py-1.5"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddAttachment(); }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddAttachment}
                      disabled={!attachName.trim() || !attachUrl.trim() || saving}
                      className="btn-primary text-xs py-1.5 px-3"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowAttachmentForm(false);
                        setAttachName("");
                        setAttachUrl("");
                      }}
                      className="btn-ghost text-xs py-1.5 px-3"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {attachments.length === 0 && !showAttachmentForm && (
                <p className="text-xs text-neutral-400 italic">No attachments yet</p>
              )}
            </div>

            {/* ---- Status transition buttons ---- */}
            {allowedTransitions.length > 0 && (
              <>
                <div className="border-t border-neutral-100" />
                <div className="flex gap-2 flex-wrap">
                  {allowedTransitions.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={saving}
                      className="btn-ghost text-xs py-1.5 px-3"
                    >
                      Move to {STATUS_LABELS[s] ?? s}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* ---- Activity Feed ---- */}
            <div className="border-t border-neutral-100" />
            <ActivityFeed taskId={task.task_id} members={members} />

            <div className="h-4" />
          </div>
        </div>
      </div>
    </>
  );
}
