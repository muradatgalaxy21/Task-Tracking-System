"use client";

// Main dashboard page — stats overview + partner presence + task board.

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import TaskListView from "@/components/tasks/TaskListView";
import TeamPresence from "@/components/dashboard/TeamPresence";
import type { Profile, TaskLedger, DailyAttendance } from "@/lib/types";
import { calculateTPS, calculateAS, calculateTotalScore, getActiveDaysInMonth } from "@/lib/calculations";
import { Users, ClipboardCheck, TrendingUp, Award } from "lucide-react";

export default function DashboardPage() {
  const { profile, user, isAdmin, loading: authLoading, refreshKey } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalTasks: 0,
    completedTasks: 0,
    avgScore: 0,
  });

  useEffect(() => {
    // Wait for auth and an active workspace before fetching
    if (authLoading || !activeWorkspace?.id) return;

    const workspaceId = activeWorkspace.id;

    const fetchStats = async () => {
      try {
        const [membersRes, tasksRes, attendanceRes] = await Promise.all([
          fetch(`/api/members?workspaceId=${workspaceId}`),
          fetch(`/api/tasks?workspaceId=${workspaceId}`),
          fetch(`/api/attendance?workspaceId=${workspaceId}`),
        ]);

        if (!membersRes.ok || !tasksRes.ok || !attendanceRes.ok) return;

        const [membersData, tasksData, attendanceData] = await Promise.all([
          membersRes.json(),
          tasksRes.json(),
          attendanceRes.json(),
        ]);

        const typedProfiles = membersData as Profile[];
        const typedTasks = tasksData as TaskLedger[];
        const typedAttendance = (attendanceData || []) as DailyAttendance[];

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        // Active days = unique dates where at least one workspace member was Present
        const activeDays = getActiveDaysInMonth(typedAttendance, currentYear, currentMonth);

        const completedTasks = typedTasks.filter((t) => t.status === "Completed");

        let totalScoreSum = 0;
        for (const member of typedProfiles) {
          const memberTasks = typedTasks.filter((t) => t.assignee_id === member.id);
          const memberAttendance = typedAttendance.filter((a) => a.user_id === member.id);
          const tps = calculateTPS(memberTasks, currentYear, currentMonth);
          const as_score = calculateAS(memberAttendance, currentYear, currentMonth, activeDays);
          totalScoreSum += calculateTotalScore(tps.score, as_score);
        }

        setStats({
          totalMembers: typedProfiles.length,
          totalTasks: isAdmin
            ? typedTasks.length
            : typedTasks.filter((t) => t.assignee_id === user?.id).length,
          completedTasks: isAdmin
            ? completedTasks.length
            : completedTasks.filter((t) => t.assignee_id === user?.id).length,
          avgScore: isAdmin
            ? typedProfiles.length > 0
              ? Math.round((totalScoreSum / typedProfiles.length) * 100) / 100
              : 0
            : (() => {
                const myAttendance = typedAttendance.filter((a) => a.user_id === user?.id);
                const myTasks = typedTasks.filter((t) => t.assignee_id === user?.id);
                const myTPS = calculateTPS(myTasks, currentYear, currentMonth);
                const myAS = calculateAS(myAttendance, currentYear, currentMonth, activeDays);
                return calculateTotalScore(myTPS.score, myAS);
              })(),
        });
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      }
    };

    fetchStats();
  }, [authLoading, refreshKey, isAdmin, user?.id, activeWorkspace?.id]);

  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
        <div className="skeleton h-96 rounded-xl" />
      </div>
    );
  }

  const displayName =
    profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "User";

  const statCards = [
    {
      icon: <ClipboardCheck size={18} />,
      value: stats.totalTasks,
      label: isAdmin ? "Total Tasks" : "My Tasks",
      bg: "bg-purple-50",
      iconColor: "text-purple-500",
    },
    {
      icon: <TrendingUp size={18} />,
      value: stats.completedTasks,
      label: "Completed",
      bg: "bg-green-50",
      iconColor: "text-green-500",
    },
    {
      icon: <Award size={18} />,
      value: stats.avgScore,
      label: isAdmin ? "Avg. Score" : "My Score",
      bg: "bg-amber-50",
      iconColor: "text-amber-500",
    },
  ];

  const finalStatCards = isAdmin
    ? [
        {
          icon: <Users size={18} />,
          value: stats.totalMembers,
          label: "Team Members",
          bg: "bg-blue-50",
          iconColor: "text-blue-500",
        },
        ...statCards,
      ]
    : statCards;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-neutral-800">
          Welcome back, {displayName}
        </h1>
        <p className="text-sm text-neutral-400 mt-1">
          AI & Beyond — internal task and project dashboard
        </p>
      </div>

      {/* Partner presence — shows all owners/admins with live task counts */}
      <TeamPresence />

      {/* Stats overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {finalStatCards.map((card, i) => (
          <div key={i} className="glass-card p-5 flex items-center gap-4">
            <div
              className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}
            >
              <span className={card.iconColor}>{card.icon}</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-800">{card.value}</p>
              <p className="text-xs text-neutral-400">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Task board — Kanban / List toggle + filters */}
      <TaskListView />
    </div>
  );
}
