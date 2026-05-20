"use client";

// Partner glance bar — shows all four AI & Beyond founders with their
// active task count. Fetches live data from /api/members and /api/tasks.

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Profile, TaskLedger } from "@/lib/types";
import UserAvatar from "@/components/common/UserAvatar";

// The four founding partners of AI & Beyond in display order
const PARTNER_NAMES = ["Murad", "Abdullah", "Mujtaba", "Abdul Ahad"];

// Consistent avatar colors per partner slot
const AVATAR_COLORS = [
  { bg: "bg-warm-400/15", text: "text-warm-400" },
  { bg: "bg-blue-50",     text: "text-blue-500" },
  { bg: "bg-violet-50",   text: "text-violet-500" },
  { bg: "bg-emerald-50",  text: "text-emerald-600" },
];

interface PartnerCardProps {
  profile: Profile;
  activeTasks: number;
  colorIndex: number;
}

function PartnerCard({ profile, activeTasks, colorIndex }: PartnerCardProps) {
  const color = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const firstName = profile.full_name?.split(" ")[0] || profile.email?.split("@")[0] || "Partner";

  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-neutral-100 bg-white hover:border-neutral-200 hover:shadow-sm transition-all">
      {/* Avatar */}
      <UserAvatar
        fullName={profile.full_name}
        image={profile.image}
        size={32}
        className="rounded-lg"
      />

      {/* Info */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-800 truncate">{firstName}</p>
        <p className="text-[10px] text-neutral-400 leading-tight capitalize">{profile.role}</p>
      </div>

      {/* Active task badge */}
      <div className="ml-auto shrink-0">
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${
            activeTasks > 0
              ? "bg-warm-400/10 text-warm-500"
              : "bg-neutral-100 text-neutral-400"
          }`}
        >
          {activeTasks} task{activeTasks !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

export default function TeamPresence() {
  const { refreshKey } = useAuth();
  const [partners, setPartners] = useState<Profile[]>([]);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [membersRes, tasksRes] = await Promise.all([
          fetch("/api/members"),
          fetch("/api/tasks"),
        ]);

        if (!membersRes.ok || !tasksRes.ok) return;

        const members: Profile[] = await membersRes.json();
        const tasks: TaskLedger[] = await tasksRes.json();

        // Show Owner/Admin partners; fall back to matching known first names
        const ownerAdmins = members.filter(
          (m) => m.role === "Owner" || m.role === "Admin"
        );

        // Build active (non-completed) task counts per user
        const counts: Record<string, number> = {};
        for (const m of ownerAdmins) {
          counts[m.id] = tasks.filter(
            (t) => t.assignee_id === m.id && t.status !== "Completed"
          ).length;
        }

        setPartners(ownerAdmins);
        setTaskCounts(counts);
      } catch (err) {
        console.error("TeamPresence fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  if (partners.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest mb-2">
        Partner Presence
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {partners.map((partner, idx) => (
          <PartnerCard
            key={partner.id}
            profile={partner}
            activeTasks={taskCounts[partner.id] || 0}
            colorIndex={idx}
          />
        ))}
      </div>
    </div>
  );
}
