"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { TaskActivity, Profile } from "@/lib/types";
import { useAuth } from "@/components/providers/AuthProvider";
import { Send } from "lucide-react";

interface ActivityFeedProps {
  taskId: string;
  members: Profile[];
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// Highlights @Word patterns in comment text
function renderCommentContent(text: string): React.ReactNode {
  const parts = text.split(/(@\w+)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="text-warm-400 font-medium">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function ActivityFeed({ taskId, members }: ActivityFeedProps) {
  const { user, profile } = useAuth();
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchActivities = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/activity`);
      if (res.ok) setActivities(await res.json());
    } catch (err) {
      console.error("Failed to fetch activity:", err);
    } finally {
      setLoadingActivities(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activities]);

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCommentText(val);

    const pos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, pos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      setMentionQuery(mentionMatch[1].toLowerCase());
      setMentionStart(mentionMatch.index!);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (fullName: string | undefined | null, email: string) => {
    const firstName = fullName?.split(" ")[0] || email.split("@")[0];
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const before = commentText.slice(0, mentionStart);
    const after = commentText.slice(pos);
    setCommentText(`${before}@${firstName} ${after}`);
    setMentionQuery(null);
    textareaRef.current.focus();
  };

  const submitComment = async () => {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim(), type: "comment" }),
      });
      if (!res.ok) throw new Error("Failed to post");
      setCommentText("");
      setMentionQuery(null);
      fetchActivities();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      submitComment();
    }
    if (e.key === "Escape" && mentionQuery !== null) {
      setMentionQuery(null);
    }
  };

  const filteredMembers =
    mentionQuery !== null
      ? members.filter((m) => {
          const first = m.full_name?.split(" ")[0]?.toLowerCase() ?? "";
          const full = m.full_name?.toLowerCase() ?? "";
          return first.startsWith(mentionQuery!) || full.startsWith(mentionQuery!);
        })
      : [];

  const currentUserName = profile?.full_name || user?.email || "";
  const currentUserInitials = getInitials(currentUserName);

  return (
    <div className="space-y-3">
      <span className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider">
        Activity
      </span>

      {/* Chronological activity list */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {loadingActivities ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="skeleton h-8 w-full rounded" />)}
          </div>
        ) : activities.length === 0 ? (
          <p className="text-xs text-neutral-400 italic py-2">
            No activity yet. Status changes and comments will appear here.
          </p>
        ) : (
          activities.map((activity) => (
            <div key={activity.id}>
              {activity.type !== "comment" ? (
                // System audit log entry (status_change, field_update)
                <div className="flex items-start gap-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 mt-1.5 shrink-0" />
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    <span className="font-medium text-neutral-500">
                      {activity.actor_name}
                    </span>{" "}
                    {activity.content}
                    <span className="ml-2 text-[10px] text-neutral-300">
                      {formatRelativeTime(activity.created_at)}
                    </span>
                  </p>
                </div>
              ) : (
                // Threaded comment entry
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-warm-400/15 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[9px] font-bold text-warm-400">
                      {getInitials(activity.actor_name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 bg-neutral-50 rounded-lg px-3 py-2 border border-neutral-100">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-xs font-medium text-neutral-700">
                        {activity.actor_name}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {formatRelativeTime(activity.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed whitespace-pre-wrap break-words">
                      {renderCommentContent(activity.content)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Comment composer */}
      <div className="flex items-start gap-2.5">
        <div className="w-6 h-6 rounded-md bg-warm-400/15 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[9px] font-bold text-warm-400">{currentUserInitials}</span>
        </div>
        <div className="flex-1 relative">
          {/* @mention dropdown */}
          {mentionQuery !== null && filteredMembers.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 overflow-hidden min-w-[180px]">
              {filteredMembers.map((m) => (
                <button
                  key={m.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(m.full_name, m.email);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                >
                  <div className="w-5 h-5 rounded bg-warm-400/15 flex items-center justify-center shrink-0">
                    <span className="text-[8px] font-bold text-warm-400">
                      {getInitials(m.full_name)}
                    </span>
                  </div>
                  {m.full_name || m.email}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={commentText}
            onChange={handleCommentChange}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment... (type @ to mention)"
            className="glass-input text-xs resize-none min-h-[60px] pr-10"
            rows={2}
          />
          <button
            onClick={submitComment}
            disabled={!commentText.trim() || submitting}
            title="Send (Ctrl+Enter)"
            className="absolute bottom-2 right-2 p-1.5 rounded text-neutral-400 hover:text-warm-400 hover:bg-warm-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={13} />
          </button>
        </div>
      </div>
      <p className="text-[10px] text-neutral-400 ml-8">Ctrl+Enter to submit</p>
    </div>
  );
}
