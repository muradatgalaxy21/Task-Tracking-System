"use client";

// -------------------------------------------------------------------
// My History Page
// Shows the current user's:
//   - Finalized monthly close records (score, payout, attendance per month)
//   - Cumulative earnings total
//   - Task report: overdue, discarded, pending, completed tasks
// -------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import {
  History,
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  Trash2,
  CalendarCheck,
} from "lucide-react";

interface PayoutHistoryEntry {
  closeId: string;
  label: string;
  month: number;
  year: number;
  finalizedAt: string | null;
  tpsScore: number;
  asScore: number;
  totalScore: number;
  basePayout: number;
  perfPayout: number;
  finalPayout: number;
  presentDays: number;
  scheduledDays: number;
}

interface TaskReport {
  completed: { id: string; title: string; completedAt: string | null; multiplier: number | null; deadline: string }[];
  overdue: { id: string; title: string; status: string; deadline: string; daysOverdue: number }[];
  discarded: { id: string; title: string; deadline: string }[];
  pending: { id: string; title: string; status: string; deadline: string }[];
}

export default function HistoryPage() {
  const { loading: authLoading } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const [payoutHistory, setPayoutHistory] = useState<PayoutHistoryEntry[]>([]);
  const [taskReport, setTaskReport] = useState<TaskReport | null>(null);
  const [cumulativeEarnings, setCumulativeEarnings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"history" | "tasks">("history");

  const fetchHistory = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/user/history?workspaceId=${activeWorkspace.id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPayoutHistory(data.payoutHistory ?? []);
      setTaskReport(data.taskReport ?? null);
      setCumulativeEarnings(data.cumulativeEarnings ?? 0);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-32 rounded-xl" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-neutral-800 flex items-center gap-2">
          <History size={22} className="text-warm-500" />
          My History
        </h1>
        <p className="text-sm text-neutral-400 mt-1">
          Your past earnings, scores, attendance, and task activity.
        </p>
      </div>

      {/* Cumulative earnings summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
            <DollarSign size={18} className="text-green-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-neutral-800">
              {cumulativeEarnings > 0 ? cumulativeEarnings.toLocaleString() : "—"}
            </p>
            <p className="text-xs text-neutral-400">Total Earned (PKR)</p>
          </div>
        </div>
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <CalendarCheck size={18} className="text-blue-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-neutral-800">{payoutHistory.length}</p>
            <p className="text-xs text-neutral-400">Months Finalized</p>
          </div>
        </div>
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <TrendingUp size={18} className="text-amber-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-neutral-800">
              {payoutHistory.length > 0
                ? (payoutHistory.reduce((s, p) => s + p.totalScore, 0) / payoutHistory.length).toFixed(1)
                : "—"}
            </p>
            <p className="text-xs text-neutral-400">Avg. Score (/100)</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "history"
              ? "bg-white text-neutral-800 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Earnings History
        </button>
        <button
          onClick={() => setActiveTab("tasks")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "tasks"
              ? "bg-white text-neutral-800 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Task Report
        </button>
      </div>

      {/* Earnings History Tab */}
      {activeTab === "history" && (
        <div className="glass-card p-4">
          {payoutHistory.length === 0 ? (
            <div className="text-center py-12">
              <CalendarCheck size={40} className="text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">
                No finalized months yet. Your earnings will appear here once the owner closes a month.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="notion-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-center">Attendance</th>
                    <th className="text-center">TPS (/65)</th>
                    <th className="text-center">AS (/35)</th>
                    <th className="text-center">Score (/100)</th>
                    <th className="text-center">Base (PKR)</th>
                    <th className="text-center">Perf. (PKR)</th>
                    <th className="text-right">Final (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutHistory.map((entry) => (
                    <tr key={entry.closeId}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-neutral-800">{entry.label}</p>
                          {entry.finalizedAt && (
                            <p className="text-[10px] text-neutral-400">
                              Finalized{" "}
                              {new Date(entry.finalizedAt).toLocaleDateString("en-PK", {
                                day: "numeric",
                                month: "short",
                              })}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-neutral-600">
                          {entry.presentDays} / {entry.scheduledDays}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-blue-600">
                          {entry.tpsScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-green-600">
                          {entry.asScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-bold text-neutral-800">
                          {entry.totalScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-blue-600">
                          {entry.basePayout.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-purple-600">
                          {entry.perfPayout.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-green-600">
                          {entry.finalPayout.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-neutral-200">
                    <td colSpan={7} className="px-4 py-3 text-sm font-semibold text-neutral-700">
                      Total Earnings
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                      {cumulativeEarnings.toLocaleString()} PKR
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Task Report Tab */}
      {activeTab === "tasks" && taskReport && (
        <div className="space-y-4">
          {/* Overdue tasks */}
          <TaskReportSection
            title="Overdue Tasks"
            icon={<AlertCircle size={14} className="text-red-500" />}
            count={taskReport.overdue.length}
            countColor="text-red-500"
            empty="No overdue tasks."
          >
            {taskReport.overdue.map((t) => (
              <div key={t.id} className="flex items-start justify-between py-2 border-b border-neutral-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-neutral-800">{t.title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Status: <span className="font-medium">{t.status}</span> &bull; Deadline:{" "}
                    {new Date(t.deadline).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <span className="text-xs font-semibold text-red-500 ml-4 shrink-0">
                  {t.daysOverdue}d overdue
                </span>
              </div>
            ))}
          </TaskReportSection>

          {/* Discarded tasks */}
          <TaskReportSection
            title="Discarded Tasks"
            icon={<Trash2 size={14} className="text-neutral-400" />}
            count={taskReport.discarded.length}
            countColor="text-neutral-500"
            empty="No discarded tasks."
          >
            {taskReport.discarded.map((t) => (
              <div key={t.id} className="flex items-start justify-between py-2 border-b border-neutral-100 last:border-0">
                <p className="text-sm font-medium text-neutral-500 line-through">{t.title}</p>
                <p className="text-xs text-neutral-400 ml-4 shrink-0">
                  {new Date(t.deadline).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}
                </p>
              </div>
            ))}
          </TaskReportSection>

          {/* Pending tasks */}
          <TaskReportSection
            title="Active Tasks"
            icon={<Clock size={14} className="text-amber-500" />}
            count={taskReport.pending.length}
            countColor="text-amber-500"
            empty="No active tasks."
          >
            {taskReport.pending.map((t) => (
              <div key={t.id} className="flex items-start justify-between py-2 border-b border-neutral-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-neutral-800">{t.title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">Status: {t.status}</p>
                </div>
                <p className="text-xs text-neutral-400 ml-4 shrink-0">
                  Due{" "}
                  {new Date(t.deadline).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}
                </p>
              </div>
            ))}
          </TaskReportSection>

          {/* Completed tasks */}
          <TaskReportSection
            title="Completed Tasks"
            icon={<CheckCircle2 size={14} className="text-green-500" />}
            count={taskReport.completed.length}
            countColor="text-green-500"
            empty="No completed tasks yet."
          >
            {taskReport.completed.map((t) => (
              <div key={t.id} className="flex items-start justify-between py-2 border-b border-neutral-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-neutral-800">{t.title}</p>
                  {t.completedAt && (
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Completed{" "}
                      {new Date(t.completedAt).toLocaleDateString("en-PK", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs font-bold ml-4 shrink-0 ${
                    t.multiplier != null
                      ? t.multiplier >= 1
                        ? "text-green-600"
                        : t.multiplier >= 0.5
                        ? "text-amber-600"
                        : "text-red-500"
                      : "text-neutral-400"
                  }`}
                >
                  {t.multiplier != null ? `${(t.multiplier * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
            ))}
          </TaskReportSection>
        </div>
      )}
    </div>
  );
}

function TaskReportSection({
  title,
  icon,
  count,
  countColor,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  countColor: string;
  empty: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-neutral-700">{title}</span>
          <span className={`text-xs font-bold ${countColor}`}>{count}</span>
        </div>
        <span className="text-xs text-neutral-400">{open ? "collapse" : "expand"}</span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          {count === 0 ? (
            <p className="text-sm text-neutral-400 py-3">{empty}</p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
