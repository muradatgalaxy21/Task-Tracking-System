"use client";

// Full-width announcement banner displayed at the top of the dashboard.
// Fetches active announcements for the user's workspace and renders them as
// dismissible color-coded bars: info (blue), warning (amber), urgent (red).

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { X, Info, AlertTriangle, AlertCircle } from "lucide-react";

interface AnnouncementData {
  id: string;
  content: string;
  type: "info" | "warning" | "urgent";
  workspace_id: string | null;
  created_at: string;
  user: {
    full_name: string | null;
    image: string | null;
  };
}

// Color and icon configuration per announcement type
const TYPE_CONFIG: Record<
  string,
  { bg: string; border: string; text: string; icon: React.ReactNode }
> = {
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    icon: <Info size={15} className="text-blue-500 shrink-0" />,
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    icon: <AlertTriangle size={15} className="text-amber-500 shrink-0" />,
  },
  urgent: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    icon: <AlertCircle size={15} className="text-red-500 shrink-0" />,
  },
};

export default function AnnouncementBanner() {
  const { activeWorkspace } = useWorkspace();
  const [announcements, setAnnouncements] = useState<AnnouncementData[]>([]);
  // Track dismissed announcements in the current session
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchAnnouncements = useCallback(async () => {
    if (!activeWorkspace?.id) {
      setAnnouncements([]);
      return;
    }
    try {
      const res = await fetch(`/api/announcements?workspaceId=${activeWorkspace.id}`);
      if (!res.ok) return;
      const data: AnnouncementData[] = await res.json();
      setAnnouncements(data);
    } catch {
      // Non-critical — banner simply won't show
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    setAnnouncements([]);
    fetchAnnouncements();
  }, [activeWorkspace?.id, fetchAnnouncements]);

  // Load dismissed state from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("dismissedAnnouncements");
    if (stored) {
      try {
        setDismissed(new Set(JSON.parse(stored)));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  const handleDismiss = (id: string) => {
    // 1. Add the announcement ID to the dismissed set.
    // 2. Persist to sessionStorage so dismissals survive tab navigation.
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      sessionStorage.setItem("dismissedAnnouncements", JSON.stringify([...next]));
      return next;
    });
  };

  // Filter out dismissed announcements
  const visibleAnnouncements = announcements.filter((a) => !dismissed.has(a.id));

  if (visibleAnnouncements.length === 0) return null;

  return (
    <div className="space-y-0">
      {visibleAnnouncements.map((announcement) => {
        const config = TYPE_CONFIG[announcement.type] || TYPE_CONFIG.info;
        return (
          <div
            key={announcement.id}
            className={`flex items-center gap-3 px-4 py-2.5 ${config.bg} ${config.border} border-b text-sm animate-fade-in`}
          >
            {config.icon}
            <p className={`flex-1 text-xs font-medium ${config.text} leading-snug`}>
              {announcement.content}
              {announcement.user?.full_name && (
                <span className="ml-2 text-[10px] opacity-60 font-normal">
                  — {announcement.user.full_name}
                </span>
              )}
            </p>
            <button
              onClick={() => handleDismiss(announcement.id)}
              className={`p-1 rounded-md hover:bg-black/5 transition-colors shrink-0 ${config.text} opacity-50 hover:opacity-100`}
              aria-label="Dismiss announcement"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
