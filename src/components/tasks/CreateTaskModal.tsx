"use client";

// -------------------------------------------------------------------
// Task Creation Modal
// Allows Admin or Members to create new tasks with title, description,
// assignee, estimated days, priority, and deadline.
// Restyled for warm light theme.
// -------------------------------------------------------------------

import { useState } from "react";
import type { Profile, TaskPriority } from "@/lib/types";
import { X, Plus, Loader2, ChevronDown } from "lucide-react";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  members: Profile[];
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  onCreated,
  members,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [estimatedDays, setEstimatedDays] = useState(1);
  const [priority, setPriority] = useState<TaskPriority | "">("Medium");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const selectedMember = members.find((m) => m.id === assigneeId);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }
    if (!assigneeId) {
      setError("Please select an assignee.");
      return;
    }
    if (estimatedDays < 1) {
      setError("Estimated days must be at least 1.");
      return;
    }
    if (!deadline) {
      setError("Please set a deadline.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          assignee_id: assigneeId,
          estimated_days: estimatedDays,
          max_deadline: new Date(deadline).toISOString(),
          priority: priority || null,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to create task");
      }

      // Reset form and close modal
      setTitle("");
      setDescription("");
      setAssigneeId("");
      setEstimatedDays(1);
      setPriority("Medium");
      setDeadline("");
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
      console.error("Task creation error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass-card w-full max-w-lg mx-4 p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-neutral-800">Create New Task</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
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

          {/* Assignee + Priority (side by side) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                Assignee
              </label>
              
              {/* Custom Select for Assignee */}
              <div 
                className="glass-input flex justify-between items-center cursor-pointer min-h-[40px]"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                {selectedMember ? (
                  <div className="flex flex-col text-left leading-tight">
                    <span className="text-sm text-neutral-800 font-medium">
                      {selectedMember.full_name || selectedMember.email?.split('@')[0] || "User"}
                    </span>
                  </div>
                ) : (
                  <span className="text-neutral-400 text-sm">Select member...</span>
                )}
                <ChevronDown size={14} className="text-neutral-400 shrink-0 ml-2" />
              </div>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-neutral-200 rounded-lg overflow-hidden z-50 shadow-lg">
                  <div className="max-h-48 overflow-y-auto p-1">
                    {members.length === 0 ? (
                      <div className="p-3 text-xs text-neutral-400 text-center">No members found</div>
                    ) : (
                      members.map((m) => {
                        const displayName = m.full_name || m.email?.split('@')[0] || "User";
                        return (
                          <div 
                            key={m.id}
                            className={`p-2.5 rounded-md cursor-pointer hover:bg-neutral-50 transition-colors ${assigneeId === m.id ? 'bg-warm-50' : ''}`}
                            onClick={() => { setAssigneeId(m.id); setIsDropdownOpen(false); }}
                          >
                            <div className="text-sm text-neutral-800 font-medium">{displayName}</div>
                            <div className="text-[10px] text-neutral-400 mt-0.5 truncate">{m.email}</div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Priority selector */}
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
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          {/* Estimated Days + Deadline (side by side) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                Estimated Days
              </label>
              <input
                type="number"
                value={estimatedDays}
                onChange={(e) =>
                  setEstimatedDays(Math.max(1, parseInt(e.target.value) || 1))
                }
                min={1}
                className="glass-input"
                required
              />
              <p className="text-[10px] text-neutral-400 mt-1">
                Deadline multiplier tracked on completion
              </p>
            </div>

            {/* Deadline */}
            <div>
              <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="glass-input"
                required
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center gap-2 flex-1 justify-center"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              {loading ? "Creating..." : "Create Task"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
