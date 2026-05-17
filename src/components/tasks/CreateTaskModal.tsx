"use client";

// Task creation modal with technical metadata fields for AI evaluation work.
// Priority supports Urgent/High/Medium/Low. Technical section is collapsible.

import { useState } from "react";
import type { Profile, TaskPriority } from "@/lib/types";
import { X, Plus, Loader2, ChevronDown, ChevronUp, Cpu } from "lucide-react";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  members: Profile[];
  workspaceId?: string;
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  onCreated,
  members,
  workspaceId,
}: CreateTaskModalProps) {
  const [title, setTitle]               = useState("");
  const [description, setDescription]   = useState("");
  const [assigneeId, setAssigneeId]     = useState("");
  const [priority, setPriority]         = useState<TaskPriority | "">("Medium");
  const [deadline, setDeadline]         = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);

  // Technical metadata fields
  const [aiModelUsed, setAiModelUsed]       = useState("");
  const [benchmarkScore, setBenchmarkScore] = useState("");
  const [repoLink, setRepoLink]             = useState("");

  const selectedMember = members.find((m) => m.id === assigneeId);

  if (!isOpen) return null;

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setAssigneeId("");
    setPriority("Medium");
    setDeadline("");
    setAiModelUsed("");
    setBenchmarkScore("");
    setRepoLink("");
    setShowTechnical(false);
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) { setError("Task title is required."); return; }
    if (!assigneeId)   { setError("Please select an assignee."); return; }
    if (!deadline)     { setError("Please set a deadline."); return; }

    try {
      setLoading(true);

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          assignee_id: assigneeId,
          workspace_id: workspaceId || null,
          max_deadline: new Date(deadline).toISOString(),
          priority: priority || null,
          ai_model_used: aiModelUsed.trim() || null,
          benchmark_score: benchmarkScore.trim() || null,
          repo_link: repoLink.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create task");
      }

      resetForm();
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="glass-card w-full max-w-lg mx-4 p-6 animate-slide-up max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-neutral-800">Create New Task</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title..."
              className="glass-input"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task..."
              className="glass-input min-h-[80px] resize-none"
              rows={3}
            />
          </div>

          {/* Assignee + Priority */}
          <div className="grid grid-cols-2 gap-4">
            {/* Custom assignee dropdown */}
            <div className="relative">
              <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                Assignee
              </label>
              <div
                className="glass-input flex justify-between items-center cursor-pointer min-h-[40px]"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                {selectedMember ? (
                  <span className="text-sm text-neutral-800 font-medium">
                    {selectedMember.full_name || selectedMember.email?.split("@")[0]}
                  </span>
                ) : (
                  <span className="text-neutral-400 text-sm">Select member...</span>
                )}
                <ChevronDown size={14} className="text-neutral-400 shrink-0 ml-2" />
              </div>

              {isDropdownOpen && (
                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-neutral-200 rounded-lg overflow-hidden z-50 shadow-lg">
                  <div className="max-h-48 overflow-y-auto p-1">
                    {members.length === 0 ? (
                      <div className="p-3 text-xs text-neutral-400 text-center">
                        No members found
                      </div>
                    ) : (
                      members.map((m) => (
                        <div
                          key={m.id}
                          className={`p-2.5 rounded-md cursor-pointer hover:bg-neutral-50 transition-colors ${
                            assigneeId === m.id ? "bg-warm-50" : ""
                          }`}
                          onClick={() => { setAssigneeId(m.id); setIsDropdownOpen(false); }}
                        >
                          <div className="text-sm text-neutral-800 font-medium">
                            {m.full_name || m.email?.split("@")[0] || "User"}
                          </div>
                          <div className="text-[10px] text-neutral-400 mt-0.5 truncate">
                            {m.email}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority | "")}
                className="glass-select"
              >
                <option value="">None</option>
                <option value="Urgent">Urgent</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
              Deadline
            </label>
            {/* datetime-local accepts YYYY-MM-DDTHH:MM and is interpreted as local time */}
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="glass-input"
              required
            />
          </div>

          {/* Technical metadata (collapsible) */}
          <div className="border border-neutral-100 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTechnical(!showTechnical)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-neutral-500 hover:bg-neutral-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Cpu size={13} className="text-blue-400" />
                Technical Details
                <span className="text-[10px] text-neutral-400 font-normal">
                  (AI model, benchmark, repo)
                </span>
              </div>
              {showTechnical ? (
                <ChevronUp size={13} />
              ) : (
                <ChevronDown size={13} />
              )}
            </button>

            {showTechnical && (
              <div className="px-3 pb-3 pt-1 space-y-3 border-t border-neutral-100 bg-neutral-50/40 animate-fade-in">
                <div>
                  <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                    AI Model Used
                  </label>
                  <input
                    type="text"
                    value={aiModelUsed}
                    onChange={(e) => setAiModelUsed(e.target.value)}
                    placeholder="e.g. GPT-4o, Claude 3.5, Gemini 1.5..."
                    className="glass-input text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                    Benchmark Score
                  </label>
                  <input
                    type="text"
                    value={benchmarkScore}
                    onChange={(e) => setBenchmarkScore(e.target.value)}
                    placeholder="e.g. 87.4 / 100, MMLU 72%..."
                    className="glass-input text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                    Repo Link
                  </label>
                  <input
                    type="url"
                    value={repoLink}
                    onChange={(e) => setRepoLink(e.target.value)}
                    placeholder="https://github.com/..."
                    className="glass-input text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center gap-2 flex-1 justify-center"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {loading ? "Creating..." : "Create Task"}
            </button>
            <button type="button" onClick={handleClose} className="btn-ghost">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
