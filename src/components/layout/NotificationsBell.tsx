"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Notification } from "@/lib/types";
import { Bell, Check, Loader2 } from "lucide-react";

/**
 * NotificationsBell Component
 * 1. Fetch user notifications on mount and refresh key updates
 * 2. Maintain bell badge counter and dropdown visibility state
 * 3. Handle click outside dropdown to auto-close
 * 4. Relocate the panel to open downwards and align to the right (top-right corner usage)
 */
export default function NotificationsBell() {
  const { user, refreshKey } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // 1. Fetch user notifications from API
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        setNotifications(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications, refreshKey]);

  // 2. Mark all notifications as read
  const markAllRead = async () => {
    try {
      await fetch("/api/notifications", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("Failed to mark notifications as read:", err);
    }
  };

  // 3. Handle toggling dropdown and marking read
  const handleToggleDropdown = () => {
    const nextState = !showDropdown;
    setShowDropdown(nextState);
    if (nextState && unreadCount > 0) {
      markAllRead();
    }
  };

  // 4. Close dropdown on clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 5. Format ISO time string relative to current time
  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={handleToggleDropdown}
        className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-neutral-200/80 hover:bg-neutral-50 shadow-sm hover:shadow transition-all duration-200 text-neutral-500 hover:text-neutral-700 relative cursor-pointer"
        aria-label="Toggle notifications menu"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#e06b6b] flex items-center justify-center text-[9px] font-bold text-white shadow-sm shadow-[#e06b6b]/30">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Downward Dropdown Aligning to the Right */}
      {showDropdown && (
        <div className="absolute top-full right-0 w-80 mt-2 bg-white border border-neutral-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-slide-in-down">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50/50">
            <span className="text-xs font-bold text-neutral-700">Notifications</span>
            {unreadCount === 0 ? (
              <span className="text-[10px] text-neutral-400 font-medium">All read</span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                <Check size={10} />
                Marked read
              </span>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center space-y-2 text-neutral-400">
                <Bell className="w-8 h-8 mx-auto stroke-1 opacity-40 text-neutral-400" />
                <p className="text-xs font-medium">All caught up!</p>
                <p className="text-[10px] text-neutral-400">No new notifications here.</p>
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 hover:bg-neutral-50/60 transition-colors ${
                    !n.read ? "bg-warm-50/30" : ""
                  }`}
                >
                  <p className="text-xs text-neutral-700 leading-relaxed font-normal">
                    {n.message}
                  </p>
                  {n.task_title && (
                    <div className="text-[10px] text-neutral-500 mt-1 bg-neutral-100 px-1.5 py-0.5 rounded truncate inline-block max-w-full font-mono">
                      Task: {n.task_title}
                    </div>
                  )}
                  <p className="text-[9px] text-neutral-300 mt-1 font-medium">
                    {formatRelativeTime(n.created_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
