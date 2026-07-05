"use client";

// -------------------------------------------------------------------
// Month-End Close Page (Owner Only)
// Owner selects a month, reviews all member scores, edits multipliers,
// enters total revenue, previews payouts, then finalizes the close.
// Once finalized, each member's payout is permanently recorded.
// -------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { monthsBetween, getMonthKey, type MonthPoint } from "@/lib/close-range";
import {
  CalendarCheck,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Lock,
  RefreshCw,
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  Layers,
} from "lucide-react";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface MonthlyBreakdownEntry {
  year: number;
  month: number;
  tpsScore: number;
  asScore: number;
  totalScore: number;
  presentDays: number;
  scheduledDays: number;
}

interface MemberPayout {
  id: string;
  user_id: string;
  user_name: string;
  tps_score: number;
  as_score: number;
  total_score: number;
  base_payout: number;
  perf_payout: number;
  final_payout: number;
  present_days: number;
  scheduled_days: number;
  multiplier_overrides: string;
  monthly_breakdown: string;
}

interface MonthlyClose {
  id: string;
  label: string;
  start_month: number;
  start_year: number;
  month: number; // end month
  year: number; // end year
  total_revenue: number;
  scheduled_days: number;
  status: string;
  created_at: string;
  finalized_at: string | null;
  payouts: MemberPayout[];
}

interface NextRangeInfo {
  closedMonths: string[]; // "YYYY-MM" keys already covered by an existing close
  suggestedStart: MonthPoint;
  suggestedEnd: MonthPoint;
}

const monthLabel = (m: MonthPoint) => `${MONTH_NAMES[m.month]} ${m.year}`;

export default function MonthEndPage() {
  const { isOwner, loading: authLoading } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const [closes, setCloses] = useState<MonthlyClose[]>([]);
  const [activeClose, setActiveClose] = useState<MonthlyClose | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New close form state — a close now spans one or more unclosed months
  const [showNewForm, setShowNewForm] = useState(false);
  const [closeMode, setCloseMode] = useState<"auto" | "manual">("auto");
  const [nextRange, setNextRange] = useState<NextRangeInfo | null>(null);
  const [manualStart, setManualStart] = useState<MonthPoint | null>(null);
  const [manualEnd, setManualEnd] = useState<MonthPoint | null>(null);
  const [revenue, setRevenue] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchNextRange = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    try {
      const res = await fetch(`/api/monthly-close/next-range?workspaceId=${activeWorkspace.id}`);
      if (!res.ok) return;
      const data: NextRangeInfo = await res.json();
      setNextRange(data);
      setManualStart(data.suggestedStart);
      setManualEnd(data.suggestedEnd);
    } catch (err) {
      console.error("Failed to load next close range:", err);
    }
  }, [activeWorkspace?.id]);

  const fetchCloses = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/monthly-close?workspaceId=${activeWorkspace.id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCloses(data);
    } catch (err) {
      console.error("Failed to load closes:", err);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace?.id]);

  useEffect(() => {
    fetchCloses();
  }, [fetchCloses]);

  const openNewForm = () => {
    setCreateError(null);
    setShowNewForm(true);
    fetchNextRange();
  };

  const fetchCloseDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/monthly-close/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setActiveClose(data);
    } catch (err) {
      console.error("Failed to load close detail:", err);
    }
  };

  // Create a new draft close
  const handleCreateClose = async () => {
    if (!activeWorkspace?.id) return;
    setCreateError(null);

    const start = closeMode === "auto" ? nextRange?.suggestedStart : manualStart;
    const end = closeMode === "auto" ? nextRange?.suggestedEnd : manualEnd;
    if (!start || !end) {
      setCreateError("Could not determine a month range to close.");
      return;
    }
    const spanMonths = monthsBetween(start, end);
    const confirmed = window.confirm(
      `This will create a Draft close covering ${spanMonths.length} month${spanMonths.length !== 1 ? "s" : ""}: ` +
        `${spanMonths.map(monthLabel).join(", ")}.\n\n` +
        `Nothing is locked yet — you will review scores and payouts before finalizing. Continue?`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const res = await fetch("/api/monthly-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          mode: closeMode,
          startMonth: start.month,
          startYear: start.year,
          endMonth: end.month,
          endYear: end.year,
          totalRevenue: revenue,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setCreateError(err.error ?? "Failed to create close");
        return;
      }
      const { id } = await res.json();
      setShowNewForm(false);
      await fetchCloses();
      await fetchCloseDetail(id);
    } catch (err) {
      console.error("Failed to create close:", err);
    } finally {
      setSaving(false);
    }
  };

  // Recalculate payouts with updated revenue or scheduled_days
  const handleRecalculate = async () => {
    if (!activeClose) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/monthly-close/${activeClose.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalRevenue: activeClose.total_revenue,
          scheduledDays: activeClose.scheduled_days,
          action: "recalculate",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to recalculate");
        return;
      }
      await fetchCloseDetail(activeClose.id);
    } catch (err) {
      console.error("Failed to recalculate:", err);
    } finally {
      setSaving(false);
    }
  };

  // Apply a multiplier override for a specific task for a specific member
  const handleMultiplierOverride = async (memberId: string, taskId: string, value: number) => {
    if (!activeClose) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/monthly-close/${activeClose.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalRevenue: activeClose.total_revenue,
          scheduledDays: activeClose.scheduled_days,
          multiplierOverrides: { [taskId]: value },
          action: "recalculate",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to apply override");
        return;
      }
      await fetchCloseDetail(activeClose.id);
    } catch (err) {
      console.error("Failed to apply override:", err);
    } finally {
      setSaving(false);
    }
  };

  // Lock the close permanently
  const handleFinalize = async () => {
    if (!activeClose) return;
    const confirmed = window.confirm(
      `Finalize "${activeClose.label}" close? This will permanently lock all scores and payouts and cannot be undone.`
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/monthly-close/${activeClose.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize" }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to finalize");
        return;
      }
      await fetchCloses();
      await fetchCloseDetail(activeClose.id);
    } catch (err) {
      console.error("Failed to finalize:", err);
    } finally {
      setSaving(false);
    }
  };

  // Delete/Cancel an unfinalized (Draft) close
  const handleDeleteClose = async () => {
    if (!activeClose) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete the draft close "${activeClose.label}"? ` +
        `This will permanently delete all draft payouts and release these months for a new close.`
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/monthly-close/${activeClose.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to delete draft close");
        return;
      }
      setActiveClose(null);
      await fetchCloses();
    } catch (err) {
      console.error("Failed to delete close:", err);
    } finally {
      setSaving(false);
    }
  };


  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-48 rounded-xl" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="glass-card p-12 text-center max-w-md">
          <ShieldAlert size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-neutral-800 mb-2">Owner Access Only</h2>
          <p className="text-sm text-neutral-500">Only the workspace Owner can run month-end closes.</p>
        </div>
      </div>
    );
  }

  const distributionPool = (activeClose?.total_revenue ?? 0) * 0.4;
  const treasuryAmount = (activeClose?.total_revenue ?? 0) * 0.6;
  const basePool = 0;
  const performancePool = distributionPool;

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-800 flex items-center gap-2">
            <CalendarCheck size={22} className="text-warm-500" />
            Month-End Close
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Review member scores, adjust multipliers, enter revenue, then finalize to lock salaries.
          </p>
        </div>
        {!activeClose && (
          <button
            onClick={openNewForm}
            className="btn-primary flex items-center gap-2"
          >
            <CalendarCheck size={16} />
            New Close
          </button>
        )}
      </div>

      {/* New Close Form */}
      {showNewForm && (() => {
        const closedSet = new Set(nextRange?.closedMonths ?? []);
        const isMonthClosed = (year: number, month: number) => closedSet.has(getMonthKey({ year, month }));
        const yearOptions = (() => {
          const y = new Date().getFullYear();
          const years = [y - 3, y - 2, y - 1, y, y + 1];
          return years;
        })();
        const autoSpan =
          nextRange && closeMode === "auto"
            ? monthsBetween(nextRange.suggestedStart, nextRange.suggestedEnd)
            : [];
        const manualSpan =
          closeMode === "manual" && manualStart && manualEnd && manualEnd.year * 12 + manualEnd.month >= manualStart.year * 12 + manualStart.month
            ? monthsBetween(manualStart, manualEnd)
            : [];
        const manualOverlap = manualSpan.filter((m) => isMonthClosed(m.year, m.month));

        return (
          <div className="glass-card p-6 border border-warm-200/50 animate-fade-in">
            <h3 className="text-sm font-semibold text-neutral-700 mb-1">Create Month-End Close</h3>
            <p className="text-xs text-neutral-400 mb-4">
              A close can cover more than one unclosed month at once — every included month is scored
              separately, then averaged into the final TPS/AS. This creates an editable Draft only;
              nothing locks until you Finalize.
            </p>

            {/* Auto / Manual toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setCloseMode("auto")}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  closeMode === "auto" ? "bg-warm-400 text-white" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                Auto-detect
              </button>
              <button
                onClick={() => setCloseMode("manual")}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  closeMode === "manual" ? "bg-warm-400 text-white" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                Choose months manually
              </button>
            </div>

            {closeMode === "auto" ? (
              <div className="mb-4 p-3 bg-neutral-50 border border-neutral-200/60 rounded-xl">
                {nextRange ? (
                  autoSpan.length > 0 ? (
                    <p className="text-sm text-neutral-700">
                      Will close <span className="font-semibold">{autoSpan.length}</span> month
                      {autoSpan.length !== 1 ? "s" : ""}: {autoSpan.map(monthLabel).join(", ")}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-600">
                      Everything up to this month has already been closed. Nothing to sweep in yet.
                    </p>
                  )
                ) : (
                  <p className="text-sm text-neutral-400">Detecting unclosed months...</p>
                )}
              </div>
            ) : (
              <div className="mb-4 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                      Start Month
                    </label>
                    <select
                      value={manualStart?.month ?? 0}
                      onChange={(e) => setManualStart({ year: manualStart?.year ?? new Date().getFullYear(), month: Number(e.target.value) })}
                      className="glass-input"
                    >
                      {MONTH_NAMES.map((m, i) => (
                        <option key={i} value={i} disabled={isMonthClosed(manualStart?.year ?? new Date().getFullYear(), i)}>
                          {m}{isMonthClosed(manualStart?.year ?? new Date().getFullYear(), i) ? " (closed)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                      Start Year
                    </label>
                    <select
                      value={manualStart?.year ?? new Date().getFullYear()}
                      onChange={(e) => setManualStart({ year: Number(e.target.value), month: manualStart?.month ?? 0 })}
                      className="glass-input"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                      End Month
                    </label>
                    <select
                      value={manualEnd?.month ?? 0}
                      onChange={(e) => setManualEnd({ year: manualEnd?.year ?? new Date().getFullYear(), month: Number(e.target.value) })}
                      className="glass-input"
                    >
                      {MONTH_NAMES.map((m, i) => (
                        <option key={i} value={i} disabled={isMonthClosed(manualEnd?.year ?? new Date().getFullYear(), i)}>
                          {m}{isMonthClosed(manualEnd?.year ?? new Date().getFullYear(), i) ? " (closed)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                      End Year
                    </label>
                    <select
                      value={manualEnd?.year ?? new Date().getFullYear()}
                      onChange={(e) => setManualEnd({ year: Number(e.target.value), month: manualEnd?.month ?? 0 })}
                      className="glass-input"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {manualSpan.length > 0 && (
                  <p className={`text-xs ${manualOverlap.length > 0 ? "text-red-500" : "text-neutral-500"}`}>
                    {manualOverlap.length > 0
                      ? `Overlaps already-closed months: ${manualOverlap.map(monthLabel).join(", ")}`
                      : `Will close ${manualSpan.length} month${manualSpan.length !== 1 ? "s" : ""}: ${manualSpan.map(monthLabel).join(", ")}`}
                  </p>
                )}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs text-neutral-500 font-medium mb-1.5 uppercase tracking-wider">
                Total Revenue (PKR)
              </label>
              <input
                type="number"
                value={revenue || ""}
                onChange={(e) => setRevenue(Number(e.target.value))}
                placeholder="0"
                className="glass-input max-w-xs"
                min={0}
              />
            </div>

            {createError && (
              <p className="text-xs text-red-500 mb-3">{createError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleCreateClose}
                disabled={
                  saving ||
                  (closeMode === "auto" ? autoSpan.length === 0 : manualSpan.length === 0 || manualOverlap.length > 0)
                }
                className="btn-primary flex items-center gap-2"
              >
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <CalendarCheck size={14} />}
                Create Draft
              </button>
              <button
                onClick={() => setShowNewForm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar: past closes list */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest px-1">
            Close History
          </h3>
          {closes.length === 0 && (
            <p className="text-sm text-neutral-400 px-1">No closes yet. Create one to begin.</p>
          )}
          {closes.map((c) => (
            <button
              key={c.id}
              onClick={() => fetchCloseDetail(c.id)}
              className={`w-full text-left glass-card p-3 transition-all hover:shadow-md ${
                activeClose?.id === c.id
                  ? "border border-warm-300/60 bg-warm-50/40"
                  : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-800">{c.label}</span>
                {c.status === "Finalized" ? (
                  <Lock size={13} className="text-green-500" />
                ) : (
                  <ChevronRight size={13} className="text-neutral-400" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    c.status === "Finalized"
                      ? "bg-green-100 text-green-600"
                      : "bg-amber-100 text-amber-600"
                  }`}
                >
                  {c.status}
                </span>
                {c.payouts && (
                  <span className="text-[10px] text-neutral-400">
                    {c.payouts.length} members
                  </span>
                )}
              </div>
            </button>
          ))}
          {!activeClose && (
            <button
              onClick={openNewForm}
              className="w-full text-center text-xs text-warm-500 hover:text-warm-600 py-2 transition-colors"
            >
              + New Close
            </button>
          )}
        </div>

        {/* Main panel: active close details */}
        {activeClose ? (
          <div className="lg:col-span-2 space-y-4">
            {/* Status badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-neutral-800">{activeClose.label}</h2>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    activeClose.status === "Finalized"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {activeClose.status}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {activeClose.status === "Draft" && (
                  <button
                    onClick={handleDeleteClose}
                    disabled={saving}
                    className="text-xs font-medium px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:hover:bg-red-900/40 dark:text-red-400 border border-red-200 dark:border-red-900/50 transition-colors"
                  >
                    Delete Draft
                  </button>
                )}
                <button
                  onClick={() => setActiveClose(null)}
                  className="text-xs text-neutral-400 hover:text-neutral-600"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Included months — span may cover more than one calendar month */}
            <div className="flex items-center gap-2 text-xs text-neutral-500 -mt-2">
              <Layers size={12} className="text-neutral-400 shrink-0" />
              <span>
                Includes:{" "}
                {monthsBetween(
                  { year: activeClose.start_year, month: activeClose.start_month },
                  { year: activeClose.year, month: activeClose.month }
                )
                  .map(monthLabel)
                  .join(", ")}
              </span>
            </div>

            {/* Revenue + scheduled days inputs (editable if Draft) */}
            {activeClose.status === "Draft" && (
              <div className="glass-card p-4">
                <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                  Parameters
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] text-neutral-400 font-medium mb-1 uppercase tracking-wider">
                      Total Revenue (PKR)
                    </label>
                    <input
                      type="number"
                      value={activeClose.total_revenue || ""}
                      onChange={(e) =>
                        setActiveClose({ ...activeClose, total_revenue: Number(e.target.value) })
                      }
                      placeholder="0"
                      className="glass-input text-sm"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-400 font-medium mb-1 uppercase tracking-wider">
                      Scheduled Days
                    </label>
                    <input
                      type="number"
                      value={activeClose.scheduled_days}
                      onChange={(e) =>
                        setActiveClose({ ...activeClose, scheduled_days: Number(e.target.value) })
                      }
                      className="glass-input text-sm"
                      min={1}
                      max={31}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={handleRecalculate}
                      disabled={saving}
                      className="btn-secondary flex items-center gap-1.5 text-sm w-full justify-center"
                    >
                      {saving ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      Recalculate
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Distribution summary */}
            {activeClose.total_revenue > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="glass-card p-3 text-center">
                  <p className="text-[10px] text-neutral-400 uppercase font-medium tracking-wider mb-1">Revenue</p>
                  <p className="text-base font-bold text-neutral-800">
                    {activeClose.total_revenue.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-neutral-400">PKR</p>
                </div>
                <div className="glass-card p-3 text-center">
                  <p className="text-[10px] text-neutral-400 uppercase font-medium tracking-wider mb-1">Treasury (60%)</p>
                  <p className="text-base font-bold text-neutral-500">{treasuryAmount.toLocaleString()}</p>
                  <p className="text-[10px] text-neutral-400">Retained</p>
                </div>
                <div className="glass-card p-3 text-center bg-purple-50/40">
                  <p className="text-[10px] text-purple-500 uppercase font-medium tracking-wider mb-1">Perf. Pool (40%)</p>
                  <p className="text-base font-bold text-purple-600">{performancePool.toLocaleString()}</p>
                  <p className="text-[10px] text-neutral-400">Score-based</p>
                </div>
              </div>
            )}

            {/* Member payouts table */}
            <div className="glass-card p-4">
              <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Users size={13} />
                Member Scores & Payouts
              </h4>
              <div className="overflow-x-auto">
                <table className="notion-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th className="text-center">Attendance</th>
                      <th className="text-center">TPS (/65)</th>
                      <th className="text-center">AS (/35)</th>
                      <th className="text-center">Total (/100)</th>
                      <th className="text-right">Payout (PKR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeClose.payouts.map((p) => (
                      <MemberRow
                        key={p.id}
                        payout={p}
                        isFinalized={activeClose.status === "Finalized"}
                        onMultiplierOverride={handleMultiplierOverride}
                        saving={saving}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Finalize button */}
            {activeClose.status === "Draft" && (
              <div className="glass-card p-4 border border-amber-200/60 bg-amber-50/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-800">Ready to finalize?</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Finalizing will permanently lock all scores and payouts for {activeClose.label}.
                      Each member will see their salary in their dashboard. This cannot be undone.
                    </p>
                  </div>
                  <button
                    onClick={handleFinalize}
                    disabled={saving || activeClose.total_revenue <= 0}
                    className="btn-primary flex items-center gap-2 shrink-0"
                  >
                    <Lock size={14} />
                    Finalize
                  </button>
                </div>
              </div>
            )}

            {activeClose.status === "Finalized" && (
              <div className="glass-card p-4 border border-green-200/60 bg-green-50/20">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={18} className="text-green-500" />
                  <div>
                    <p className="text-sm font-medium text-neutral-800">Close Finalized</p>
                    <p className="text-xs text-neutral-500">
                      Finalized on{" "}
                      {activeClose.finalized_at
                        ? new Date(activeClose.finalized_at).toLocaleDateString("en-PK", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : "—"}
                      . All member salaries are locked.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="lg:col-span-2 flex items-center justify-center min-h-[300px]">
            <div className="text-center">
              <CalendarCheck size={40} className="text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">
                Select a close from the list or create a new one.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Individual member row with expandable multiplier override panel
function MemberRow({
  payout,
  isFinalized,
  onMultiplierOverride,
  saving,
}: {
  payout: MemberPayout;
  isFinalized: boolean;
  onMultiplierOverride: (memberId: string, taskId: string, value: number) => void;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overrideTaskId, setOverrideTaskId] = useState("");
  const [overrideValue, setOverrideValue] = useState("");

  const initials = payout.user_name
    ? payout.user_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const handleApplyOverride = () => {
    if (!overrideTaskId.trim() || overrideValue === "") return;
    const val = parseFloat(overrideValue);
    if (isNaN(val) || val < 0 || val > 1) {
      alert("Multiplier must be between 0 and 1 (e.g. 0.6)");
      return;
    }
    onMultiplierOverride(payout.user_id, overrideTaskId.trim(), val);
    setOverrideTaskId("");
    setOverrideValue("");
  };

  let existingOverrides: Record<string, number> = {};
  try {
    existingOverrides = JSON.parse(payout.multiplier_overrides || "{}");
  } catch {
    existingOverrides = {};
  }

  let monthlyBreakdown: MonthlyBreakdownEntry[] = [];
  try {
    monthlyBreakdown = JSON.parse(payout.monthly_breakdown || "[]");
  } catch {
    monthlyBreakdown = [];
  }

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-neutral-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            {expanded
              ? <ChevronDown size={13} className="text-neutral-400 shrink-0" />
              : <ChevronRight size={13} className="text-neutral-400 shrink-0" />}
            <div className="w-7 h-7 rounded-md bg-warm-400/15 flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-warm-400">{initials}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800">{payout.user_name}</p>
              {Object.keys(existingOverrides).length > 0 && (
                <p className="text-[10px] text-amber-500">
                  {Object.keys(existingOverrides).length} multiplier override(s)
                </p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-xs text-neutral-600">
            {payout.present_days} / {payout.scheduled_days} days
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-sm font-semibold text-blue-600">{payout.tps_score.toFixed(1)}</span>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-sm font-semibold text-green-600">{payout.as_score.toFixed(1)}</span>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-sm font-bold text-neutral-800">{payout.total_score.toFixed(1)}</span>
        </td>
        <td className="px-4 py-3 text-right">
          <span className="text-sm font-bold text-green-600">
            {payout.final_payout > 0 ? payout.final_payout.toLocaleString() : "—"}
          </span>
        </td>
      </tr>

      {/* Expanded panel: per-month breakdown (always) + multiplier overrides (Draft only) */}
      {expanded && (
        <tr>
          <td colSpan={6} className="px-4 pb-3">
            <div className="bg-neutral-50/80 border border-neutral-200/60 rounded-xl p-4 animate-fade-in space-y-4">
              {monthlyBreakdown.length > 1 && (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">
                    Per-Month Breakdown ({monthlyBreakdown.length} months averaged)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-neutral-400">
                          <th className="text-left font-medium py-1">Month</th>
                          <th className="text-center font-medium py-1">TPS /65</th>
                          <th className="text-center font-medium py-1">AS /35</th>
                          <th className="text-center font-medium py-1">Total /100</th>
                          <th className="text-center font-medium py-1">Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyBreakdown.map((m) => (
                          <tr key={`${m.year}-${m.month}`} className="border-t border-neutral-200/60">
                            <td className="py-1.5 text-neutral-700">
                              {MONTH_NAMES[m.month]} {m.year}
                            </td>
                            <td className="py-1.5 text-center text-blue-600 font-medium">{m.tpsScore.toFixed(1)}</td>
                            <td className="py-1.5 text-center text-green-600 font-medium">{m.asScore.toFixed(1)}</td>
                            <td className="py-1.5 text-center text-neutral-800 font-semibold">{m.totalScore.toFixed(1)}</td>
                            <td className="py-1.5 text-center text-neutral-500">{m.presentDays}/{m.scheduledDays}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!isFinalized && (
                <div>
                  <p className="text-xs font-semibold text-neutral-500 mb-3 uppercase tracking-wider">
                    Multiplier Overrides for {payout.user_name}
                  </p>

                  {Object.keys(existingOverrides).length > 0 && (
                    <div className="mb-3 space-y-1.5">
                      {Object.entries(existingOverrides).map(([taskId, val]) => (
                        <div key={taskId} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-neutral-500 truncate max-w-[200px]">{taskId}</span>
                          <span className="text-amber-600 font-semibold">&rarr; {val}x</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Task ID"
                      value={overrideTaskId}
                      onChange={(e) => setOverrideTaskId(e.target.value)}
                      className="glass-input text-xs flex-1 font-mono"
                    />
                    <input
                      type="number"
                      placeholder="Multiplier (0–1)"
                      value={overrideValue}
                      onChange={(e) => setOverrideValue(e.target.value)}
                      className="glass-input text-xs w-36"
                      step={0.1}
                      min={0}
                      max={1}
                    />
                    <button
                      onClick={handleApplyOverride}
                      disabled={saving}
                      className="btn-primary text-xs px-3 py-2"
                    >
                      Apply
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-2">
                    Enter a Task ID (from the task ledger) and an override multiplier (0 = no credit, 0.6 = 60%, 1 = full credit). This is non-destructive and stored only for this close.
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
