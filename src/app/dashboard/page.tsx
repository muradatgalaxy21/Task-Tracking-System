"use client";

// -------------------------------------------------------------------
// Main Dashboard Page
// Shows task overview stats and the Notion-like task data table.
// Admin sees full controls; Members see their own tasks.
// Warm light theme with clean card styling.
// -------------------------------------------------------------------

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import TaskListView from "@/components/tasks/TaskListView";
import type { Profile, TaskLedger, DailyAttendance } from "@/lib/types";
import { calculateTPS, calculateAS, calculateTotalScore } from "@/lib/calculations";
import { Users, ClipboardCheck, TrendingUp, Award } from "lucide-react";

export default function DashboardPage() {
  const { profile, user, isAdmin, loading: authLoading, refreshKey } = useAuth();
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalTasks: 0,
    completedTasks: 0,
    avgScore: 0,
  });

  // Fetch team overview stats for the dashboard header
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [membersRes, tasksRes, attendanceRes] = await Promise.all([
          fetch("/api/members"),
          fetch("/api/tasks"),
          fetch("/api/attendance")
        ]);

        if (!membersRes.ok || !tasksRes.ok || !attendanceRes.ok) {
          throw new Error("Failed to fetch dashboard stats");
        }

        const [membersData, tasksData, attendanceData] = await Promise.all([
          membersRes.json(),
          tasksRes.json(),
          attendanceRes.json()
        ]);

        const typedProfiles = membersData as unknown as Profile[];
        const typedTasks = tasksData as unknown as TaskLedger[];
        const typedAttendance = (attendanceData || []) as unknown as DailyAttendance[];

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const completedTasks = typedTasks.filter(
          (t) => t.status === "Completed"
        );

        // Calculate average score across all members
        let totalScoreSum = 0;
        for (const member of typedProfiles) {
          const memberTasks = typedTasks.filter(
            (t) => t.assignee_id === member.id
          );
          const memberAttendance = typedAttendance.filter(
            (a) => a.user_id === member.id
          );
          const tps = calculateTPS(memberTasks, currentYear, currentMonth);
          const as_score = calculateAS(memberAttendance, currentYear, currentMonth);
          totalScoreSum += calculateTotalScore(tps.score, as_score);
        }

        setStats({
          totalMembers: typedProfiles.length,
          totalTasks: isAdmin 
            ? typedTasks.length 
            : typedTasks.filter(t => t.assignee_id === user?.id).length,
          completedTasks: isAdmin 
            ? completedTasks.length 
            : completedTasks.filter(t => t.assignee_id === user?.id).length,
          avgScore: isAdmin
            ? (typedProfiles.length > 0
                ? Math.round((totalScoreSum / typedProfiles.length) * 100) / 100
                : 0)
            : (() => {
                const myAttendance = typedAttendance.filter(a => a.user_id === user?.id);
                const myTasks = typedTasks.filter(t => t.assignee_id === user?.id);
                const myTPS = calculateTPS(myTasks, currentYear, currentMonth);
                const myAS = calculateAS(myAttendance, currentYear, currentMonth);
                return calculateTotalScore(myTPS.score, myAS);
              })(),
        });
      } catch (err: any) {
        console.error("Failed to fetch stats:", err);
      }
    };

    fetchStats();
  }, [refreshKey, isAdmin, user?.id]);

  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
        <div className="skeleton h-96 rounded-xl" />
      </div>
    );
  }

  const displayName =
    profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "User";

  // Stats card data for clean mapping
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

  // Only show Team Members card to Admin
  const finalStatCards = isAdmin 
    ? [{
        icon: <Users size={18} />,
        value: stats.totalMembers,
        label: "Team Members",
        bg: "bg-blue-50",
        iconColor: "text-blue-500",
      }, ...statCards]
    : statCards;


  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-neutral-800">
          Welcome back, {displayName}
        </h1>
        <p className="text-sm text-neutral-400 mt-1">
          Here&apos;s an overview of the team&apos;s progress
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {finalStatCards.map((card, i) => (
          <div key={i} className="glass-card p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}>
              <span className={card.iconColor}>{card.icon}</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-neutral-800">{card.value}</p>
              <p className="text-xs text-neutral-400">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Task List View */}
      <TaskListView />
    </div>
  );
}
