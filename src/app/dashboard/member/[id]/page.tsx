"use client";

// -------------------------------------------------------------------
// Member Analytics Page
// Detailed performance view for an individual team member.
// Shows tasks, scores (TPS/AS formulas), and multiplier breakdown.
// All members can view their own page; Admin can view anyone's page.
// Restyled for warm light theme.
// -------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import ScoreWidget from "@/components/ui/ScoreWidget";
import type { Profile, TaskLedger, DailyAttendance } from "@/lib/types";
import {
  calculateTPS,
  calculateAS,
  calculateTotalScore,
  getWorkingDaysInMonth,
} from "@/lib/calculations";
import {
  User,
  Clock,
  Calendar,
  Zap,
} from "lucide-react";

export default function MemberPage() {
  const params = useParams();
  const memberId = params.id as string;
  const { isAdmin, user, refreshKey } = useAuth();

  const [member, setMember] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<TaskLedger[]>([]);
  const [attendance, setAttendance] = useState<DailyAttendance[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch member profile, their assigned tasks, and their attendance records
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [memberRes, tasksRes, attendanceRes] = await Promise.all([
        fetch(`/api/members?id=${memberId}`),
        fetch(`/api/tasks?assignee_id=${memberId}`), // I should check if tasks API supports assignee_id
        fetch(`/api/attendance?user_id=${memberId}`) // I should check if attendance API supports user_id
      ]);

      if (!memberRes.ok) throw new Error("Failed to fetch member");
      
      const memberData = await memberRes.json();
      const tasksData = tasksRes.ok ? await tasksRes.json() : [];
      const attendanceData = attendanceRes.ok ? await attendanceRes.json() : [];

      setMember(memberData);
      setTasks(tasksData);
      setAttendance(attendanceData);
    } catch (err) {
      console.error("Failed to fetch member data:", err);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-10 w-48" />
        <div className="grid grid-cols-3 gap-4">
          <div className="skeleton h-32 rounded-xl" />
          <div className="skeleton h-32 rounded-xl" />
          <div className="skeleton h-32 rounded-xl" />
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass-card p-12 text-center">
          <User size={48} className="text-neutral-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-neutral-800 mb-2">Member Not Found</h2>
          <p className="text-sm text-neutral-500">
            The requested member profile could not be found.
          </p>
        </div>
      </div>
    );
  }

  const canView = isAdmin || user?.id === memberId;


  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const tpsResult = calculateTPS(tasks, currentYear, currentMonth);
  const asScore = calculateAS(attendance, currentYear, currentMonth);
  const totalScore = calculateTotalScore(tpsResult.score, asScore);

  const currentMonthAttendance = attendance.filter((a) => {
    const d = new Date(a.date);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });
  const presentDays = currentMonthAttendance.filter((a) => a.status === "Present").length;
  const lateDays = currentMonthAttendance.filter((a) => a.status === "Late").length;
  const absentDays = currentMonthAttendance.filter((a) => a.status === "Absent").length;
  const totalScheduled = getWorkingDaysInMonth(currentYear, currentMonth);

  const completedTasks = tasks.filter((t) => t.status === "Completed");
  const inProgressTasks = tasks.filter((t) => t.status === "In Progress");
  const inReviewTasks = tasks.filter((t) => t.status === "In Review");
  const overdueTasks = tasks.filter(
    (t) => new Date(t.max_deadline) < new Date() && t.status !== "Completed"
  );

  const monthName = now.toLocaleString("default", { month: "long", year: "numeric" });

  const initials = member.full_name
    ? member.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Member header */}
      <div className="glass-card p-6 flex items-center gap-5">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-lg font-bold text-white"
          style={{ background: "linear-gradient(135deg, #e06b6b, #c85555)" }}
        >
          {initials}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-neutral-800">{member.full_name || member.email?.split('@')[0] || "User"}</h1>
          <p className="text-sm text-neutral-400">{member.email}</p>
          <span
            className={`inline-block mt-1 px-2.5 py-0.5 rounded-md text-xs font-medium ${
              member.role === "Admin"
                ? "bg-purple-50 text-purple-600"
                : "bg-blue-50 text-blue-600"
            }`}
          >
            {member.role}
          </span>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] text-neutral-400 uppercase font-medium tracking-wider">
            Assessment Period
          </p>
          <p className="text-sm text-neutral-600 font-medium">{monthName}</p>
        </div>
      </div>

      {!canView ? (
        <div className="glass-card p-12 text-center">
          <Clock size={48} className="text-neutral-200 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-neutral-800 mb-2">Performance Data Private</h2>
          <p className="text-sm text-neutral-500 max-w-sm mx-auto">
            Stats, scores, and task details are only visible to the member themselves and administrators.
          </p>
        </div>
      ) : (
        <>
          {/* Score widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ScoreWidget
          label="Task Performance"
          score={tpsResult.score}
          maxScore={80}
          color="#337ea9"
          subtitle={`${tpsResult.weeklyBreakdown.filter((w) => w.tasks.length > 0).length} active weeks this month`}
        />
        <ScoreWidget
          label="Attendance"
          score={asScore}
          maxScore={20}
          color="#448361"
          subtitle={`${presentDays} / ${totalScheduled} scheduled days`}
        />
        <ScoreWidget
          label="Total Score"
          score={totalScore}
          maxScore={100}
          color="#e06b6b"
          subtitle="Combined performance rating"
        />
      </div>

      {/* Attendance summary (current month) */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-medium text-neutral-700 mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-warm-400" />
          Attendance This Month
          <span className="text-[10px] text-neutral-400 font-normal ml-auto">
            {totalScheduled} working days scheduled
          </span>
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{presentDays}</p>
            <p className="text-xs text-neutral-500 mt-1">Present</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{lateDays}</p>
            <p className="text-xs text-neutral-500 mt-1">Late</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{absentDays}</p>
            <p className="text-xs text-neutral-500 mt-1">Absent</p>
          </div>
        </div>
      </div>

      {/* Task stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-neutral-800">{tasks.length}</p>
          <p className="text-xs text-neutral-400">Total Tasks</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{completedTasks.length}</p>
          <p className="text-xs text-neutral-400">Completed</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-blue-500">
            {inProgressTasks.length + inReviewTasks.length}
          </p>
          <p className="text-xs text-neutral-400">Active</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{overdueTasks.length}</p>
          <p className="text-xs text-neutral-400">Overdue</p>
        </div>
      </div>

      {/* Weekly TPS Breakdown */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-medium text-neutral-700 mb-4 flex items-center gap-2">
          <Zap size={16} className="text-amber-500" />
          Weekly Performance Breakdown
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tpsResult.weeklyBreakdown.map((week) => (
            <div
              key={week.week}
              className="bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-center"
            >
              <p className="text-[10px] text-neutral-400 uppercase font-medium tracking-wider mb-2">
                Week {week.week}
              </p>
              <p
                className={`text-xl font-bold ${
                  week.average >= 0.8
                    ? "text-green-600"
                    : week.average >= 0.5
                    ? "text-amber-600"
                    : week.tasks.length > 0
                    ? "text-red-500"
                    : "text-neutral-300"
                }`}
              >
                {week.tasks.length > 0
                  ? (week.average * 100).toFixed(0) + "%"
                  : "\u2014"}
              </p>
              <p className="text-[10px] text-neutral-400 mt-1">
                {week.tasks.length} task{week.tasks.length !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Task detail breakdown table */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200/60">
          <h3 className="text-sm font-medium text-neutral-700">
            Task Score Breakdown
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="notion-table">
            <thead>
              <tr>
                <th>Task</th>
                <th className="text-center">Week</th>
                <th className="text-center">Status</th>
                <th className="text-center">Multiplier Earned</th>
                <th className="text-center">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {tpsResult.details.map((detail) => {
                const task = tasks.find((t) => t.task_id === detail.taskId);
                return (
                  <tr key={detail.taskId}>
                    <td className="px-4 py-3">
                      <span className="text-sm text-neutral-800 font-medium">
                        {detail.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-neutral-500">
                        {detail.weekOfMonth ? `W${detail.weekOfMonth}` : "\u2014"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-neutral-500">
                        {detail.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-sm font-semibold ${
                          detail.multiplier >= 1.0
                            ? "text-green-600"
                            : detail.multiplier >= 0.6
                            ? "text-amber-600"
                            : detail.multiplier >= 0.4
                            ? "text-orange-500"
                            : detail.multiplier > 0
                            ? "text-red-500"
                            : "text-neutral-300"
                        }`}
                      >
                        {detail.multiplier > 0
                          ? `${detail.multiplier}x`
                          : "\u2014"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {task && (
                        <span className="text-xs text-neutral-500 flex items-center justify-center gap-1">
                          <Clock size={10} />
                          {new Date(task.max_deadline).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {tpsResult.details.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-neutral-400">
                    No tasks assigned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
