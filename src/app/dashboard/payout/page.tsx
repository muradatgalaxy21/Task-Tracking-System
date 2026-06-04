"use client";

// -------------------------------------------------------------------
// Payout Calculator Page (Admin Only)
// Implements the 3-tier payout distribution:
//   Tier 1: Treasury = 60% of Total Revenue (retained)
//   Tier 2: Distribution Pool = 40% of Total Revenue
//     - Base Pool: 60% of Distribution Pool (split equally per member)
//     - Performance Pool: 40% of Distribution Pool (score-proportional)
//   Final Payout = Base Payout + Performance Payout
// Restyled for warm light theme.
// -------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import type { Profile, TaskLedger, DailyAttendance } from "@/lib/types";
import {
  calculateTPS,
  calculateAS,
  calculateTotalScore,
  calculatePayouts,
  getActiveDaysInMonth,
  type PayoutResult,
} from "@/lib/calculations";
import {
  Calculator,
  DollarSign,
  TrendingUp,
  ShieldAlert,
  PieChart,
} from "lucide-react";

export default function PayoutPage() {
  const { isAdmin, loading: authLoading, refreshKey } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [members, setMembers] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<TaskLedger[]>([]);
  const [attendance, setAttendance] = useState<DailyAttendance[]>([]);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [payouts, setPayouts] = useState<PayoutResult[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all member profiles, tasks, and attendance records scoped to the active workspace
  const fetchData = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    try {
      setLoading(true);
      const workspaceId = activeWorkspace.id;

      const [membersRes, tasksRes, attendanceRes] = await Promise.all([
        fetch(`/api/members?workspaceId=${workspaceId}`),
        fetch(`/api/tasks?workspaceId=${workspaceId}`),
        fetch(`/api/attendance?workspaceId=${workspaceId}`)
      ]);

      if (!membersRes.ok || !tasksRes.ok || !attendanceRes.ok) {
        throw new Error("Failed to fetch data for payout calculation");
      }

      const [membersData, tasksData, attendanceData] = await Promise.all([
        membersRes.json(),
        tasksRes.json(),
        attendanceRes.json()
      ]);

      setMembers(membersData);
      setTasks(tasksData);
      setAttendance(attendanceData);
    } catch (err) {
      console.error("Failed to fetch payout data:", err);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey, activeWorkspace?.id]);

  // Calculate payout distribution
  const handleCalculate = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    // Active days = unique dates this month where at least one workspace member was Present
    const activeDays = getActiveDaysInMonth(attendance, currentYear, currentMonth);

    const memberScores = members.map((member) => {
      const memberTasks = tasks.filter((t) => t.assignee_id === member.id);
      const memberAttendance = attendance.filter(
        (a) => a.user_id === member.id
      );
      const tps = calculateTPS(memberTasks, currentYear, currentMonth);
      const as_score = calculateAS(memberAttendance, currentYear, currentMonth, activeDays);
      const total = calculateTotalScore(tps.score, as_score);

      return {
        memberId: member.id,
        memberName: member.full_name,
        totalScore: total,
      };
    });

    const results = calculatePayouts(memberScores, totalRevenue);
    setPayouts(results);
  };

  const distributionPool = totalRevenue * 0.4;
  const treasuryAmount = totalRevenue * 0.6;
  const basePool = distributionPool * 0.6;
  const performancePool = distributionPool * 0.4;

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-48 rounded-xl" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="glass-card p-12 text-center max-w-md">
          <ShieldAlert size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-neutral-800 mb-2">Access Denied</h2>
          <p className="text-sm text-neutral-500">
            Only Admin users can access the Payout Calculator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-neutral-800">Payout Calculator</h1>
        <p className="text-sm text-neutral-400 mt-1">
          3-tier monthly bonus distribution based on performance scores
        </p>
      </div>

      {/* Revenue Input */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-medium text-neutral-700 mb-4 flex items-center gap-2">
          <DollarSign size={16} className="text-green-500" />
          Monthly Revenue Input
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
              Total Monthly Revenue (PKR)
            </label>
            <input
              type="number"
              value={totalRevenue || ""}
              onChange={(e) => {
                setTotalRevenue(Number(e.target.value));
                setPayouts([]);
              }}
              placeholder="e.g., 500000"
              className="glass-input"
              min={0}
            />
          </div>

          <button
            onClick={handleCalculate}
            disabled={totalRevenue <= 0}
            className="btn-primary flex items-center justify-center gap-2 h-[42px] md:col-start-3"
          >
            <Calculator size={16} />
            Calculate Payouts
          </button>
        </div>
      </div>

      {/* Pool Breakdown Summary */}
      {totalRevenue > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-medium text-neutral-700 mb-4 flex items-center gap-2">
            <PieChart size={16} className="text-purple-500" />
            Distribution Breakdown
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4">
              <p className="text-[10px] text-neutral-400 uppercase font-medium tracking-wider mb-1">
                Total Revenue
              </p>
              <p className="text-lg font-bold text-neutral-800">
                {totalRevenue.toLocaleString()}
              </p>
              <p className="text-[10px] text-neutral-400 mt-0.5">PKR</p>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
              <p className="text-[10px] text-neutral-400 uppercase font-medium tracking-wider mb-1">
                Treasury (60%)
              </p>
              <p className="text-lg font-bold text-neutral-500">
                {treasuryAmount.toLocaleString()}
              </p>
              <p className="text-[10px] text-neutral-400 mt-0.5">Retained</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-[10px] text-blue-500 uppercase font-medium tracking-wider mb-1">
                Base Pool (24%)
              </p>
              <p className="text-lg font-bold text-blue-600">
                {basePool.toLocaleString()}
              </p>
              <p className="text-[10px] text-neutral-400 mt-0.5">Equal split</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
              <p className="text-[10px] text-purple-500 uppercase font-medium tracking-wider mb-1">
                Perf. Pool (16%)
              </p>
              <p className="text-lg font-bold text-purple-600">
                {performancePool.toLocaleString()}
              </p>
              <p className="text-[10px] text-neutral-400 mt-0.5">Score-based</p>
            </div>
          </div>
        </div>
      )}

      {/* Member Score Breakdown */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-medium text-neutral-700 mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-blue-500" />
          Member Score & Payout Breakdown
        </h3>

        <div className="overflow-x-auto">
          <table className="notion-table">
            <thead>
              <tr>
                <th>Member</th>
                <th className="text-center">TPS (/65)</th>
                <th className="text-center">AS (/35)</th>
                <th className="text-center">Total (/100)</th>
                <th className="text-center">Share %</th>
                <th className="text-center">Base (PKR)</th>
                <th className="text-center">Perf. (PKR)</th>
                <th className="text-right">Final (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const now = new Date();
                const yr = now.getFullYear();
                const mo = now.getMonth();
                const activeDaysDisplay = getActiveDaysInMonth(attendance, yr, mo);
                const memberTasks = tasks.filter(
                  (t) => t.assignee_id === member.id
                );
                const memberAttendance = attendance.filter(
                  (a) => a.user_id === member.id
                );
                const tps = calculateTPS(memberTasks, yr, mo);
                const as_score = calculateAS(memberAttendance, yr, mo, activeDaysDisplay);
                const total = calculateTotalScore(tps.score, as_score);
                const payout = payouts.find((p) => p.memberId === member.id);

                const initials = member.full_name
                  ? member.full_name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)
                  : "?";

                return (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-md bg-warm-400/15 flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-bold text-warm-400">
                            {initials}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-neutral-800">
                            {member.full_name || "Unknown"}
                          </p>
                          <p className="text-[10px] text-neutral-400">
                            {member.role}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-blue-600">
                        {tps.score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-green-600">
                        {as_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold text-neutral-800">
                        {total}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-amber-600">
                        {payout ? `${payout.sharePercentage}%` : "\u2014"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-blue-600">
                        {payout ? payout.basePayout.toLocaleString() : "\u2014"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-purple-600">
                        {payout ? payout.perfPayout.toLocaleString() : "\u2014"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-green-600">
                        {payout ? payout.finalPayout.toLocaleString() : "\u2014"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
