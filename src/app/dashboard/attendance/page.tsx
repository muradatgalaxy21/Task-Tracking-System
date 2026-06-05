"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import type { Profile, DailyAttendance, AttendanceStatus } from "@/lib/types";
import { Calendar, Save, Loader2, CheckCircle2, History, X, ChevronLeft, ChevronRight } from "lucide-react";

// Safe ISO date slicer — avoids timezone shift from new Date() parsing
function isoDateSlice(date: string | Date): string {
  return typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
}

// Status options for the radio button group
const STATUS_OPTIONS: { value: AttendanceStatus; label: string; activeColor: string }[] =
  [
    { value: "Present", label: "Present", activeColor: "#448361" },
    { value: "Late", label: "Late", activeColor: "#cb912f" },
    { value: "Absent", label: "Absent", activeColor: "#e06b6b" },
  ];

export default function AttendancePage() {
  const { isAdmin, loading: authLoading, refreshKey } = useAuth();
  const { activeWorkspace, wsLoading } = useWorkspace();
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // History slide-over state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<DailyAttendance[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Fetch members scoped to the active workspace only
  const fetchMembers = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    try {
      const response = await fetch(`/api/members?workspaceId=${activeWorkspace.id}`);
      if (!response.ok) throw new Error("Failed to fetch members");
      const data = await response.json();
      setMembers(data);
    } catch (err) {
      console.error("Failed to fetch members:", err);
    }
  }, [activeWorkspace?.id]);

  // Fetch existing attendance records for the selected date
  const fetchAttendanceForDate = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/attendance?date=${selectedDate}`);
      if (!response.ok) throw new Error("Failed to fetch attendance");
      const data = await response.json();

      const records = data as unknown as DailyAttendance[];

      // Build a lookup map from existing records
      const map: Record<string, AttendanceStatus> = {};
      for (const record of records) {
        map[record.user_id] = record.status;
      }
      setStatusMap(map);
    } catch (err) {
      console.error("Failed to fetch attendance records:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Fetch all workspace attendance for the history slide-over
  const fetchHistory = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    try {
      setHistoryLoading(true);
      const res = await fetch(`/api/attendance?workspaceId=${activeWorkspace.id}`);
      if (!res.ok) throw new Error("Failed to fetch history");
      setHistoryRecords(await res.json());
    } catch (err) {
      console.error("Failed to fetch attendance history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, [activeWorkspace?.id]);

  const openHistory = () => {
    setHistoryOpen(true);
    fetchHistory();
  };

  // Navigate history month by ±1
  const shiftHistoryMonth = (delta: number) => {
    const [yr, mo] = historyMonth.split("-").map(Number);
    const d = new Date(yr, mo - 1 + delta, 1);
    setHistoryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  // Re-fetch when active workspace or auth state changes
  useEffect(() => {
    fetchMembers();
  }, [fetchMembers, refreshKey, activeWorkspace?.id]);

  useEffect(() => {
    if (selectedDate) fetchAttendanceForDate();
  }, [selectedDate, fetchAttendanceForDate, refreshKey]);

  // Update the local status map when a radio button is toggled
  const handleStatusChange = (userId: string, status: AttendanceStatus) => {
    setStatusMap((prev) => ({ ...prev, [userId]: status }));
    setSaved(false);
  };

  // Upsert all attendance records for the selected date
  const handleSave = async () => {
    try {
      setSaving(true);
      setSaved(false);

      const upsertRows = Object.entries(statusMap).map(([userId, status]) => ({
        user_id: userId,
        date: selectedDate,
        status,
      }));

      if (upsertRows.length === 0) {
        alert("Please select a status for at least one member.");
        return;
      }

      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upsertRows),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to save attendance");
      }

      setSaved(true);
    } catch (err: any) {
      console.error("Error saving attendance:", err);
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || wsLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-96 rounded-xl" />
      </div>
    );
  }

  // No workspace selected - nothing to show
  if (!activeWorkspace) {
    return (
      <div className="space-y-6 animate-fade-in max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-800">Daily Attendance</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Select a workspace from the sidebar to view attendance.
          </p>
        </div>
      </div>
    );
  }


  // Build history table data for the selected month
  const [histYr, histMo] = historyMonth.split("-").map(Number);
  const histMonthLabel = new Date(histYr, histMo - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });

  // Unique sorted dates in the selected history month
  const histDates = Array.from(new Set(
    historyRecords
      .filter((r) => isoDateSlice(r.date).startsWith(historyMonth))
      .map((r) => isoDateSlice(r.date))
  )).sort();

  // Build lookup: date → userId → status
  const histLookup: Record<string, Record<string, AttendanceStatus>> = {};
  for (const r of historyRecords) {
    const d = isoDateSlice(r.date);
    if (!histLookup[d]) histLookup[d] = {};
    histLookup[d][r.user_id] = r.status;
  }

  const STATUS_COLORS: Record<AttendanceStatus, string> = {
    Present: "text-green-600 bg-green-50",
    Late: "text-amber-600 bg-amber-50",
    Absent: "text-red-500 bg-red-50",
  };

  return (
    <>
    {/* History Slide-Over */}
    {historyOpen && (
      <div className="fixed inset-0 z-50 flex">
        {/* Backdrop */}
        <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setHistoryOpen(false)} />
        {/* Panel */}
        <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
          {/* Panel header */}
          <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-base font-semibold text-neutral-800">Attendance History</h2>
              <p className="text-xs text-neutral-400 mt-0.5">{activeWorkspace?.name}</p>
            </div>
            <button onClick={() => setHistoryOpen(false)} className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">
              <X size={18} className="text-neutral-500" />
            </button>
          </div>

          {/* Month navigator */}
          <div className="px-6 py-3 border-b border-neutral-100 flex items-center justify-between shrink-0">
            <button onClick={() => shiftHistoryMonth(-1)} className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">
              <ChevronLeft size={16} className="text-neutral-500" />
            </button>
            <span className="text-sm font-medium text-neutral-700">{histMonthLabel}</span>
            <button onClick={() => shiftHistoryMonth(1)} className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">
              <ChevronRight size={16} className="text-neutral-500" />
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {historyLoading ? (
              <div className="p-6 space-y-3">
                {[1,2,3,4,5].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
              </div>
            ) : histDates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-neutral-400 text-sm">
                No attendance recorded for {histMonthLabel}.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b border-neutral-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider w-32">Date</th>
                    {members.map((m) => (
                      <th key={m.id} className="text-center px-3 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        {m.full_name?.split(" ")[0] || m.email?.split("@")[0] || "?"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {histDates.map((date) => {
                    const dayLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
                    return (
                      <tr key={date} className="hover:bg-neutral-50/60 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-neutral-500 font-medium">{dayLabel}</td>
                        {members.map((m) => {
                          const status = histLookup[date]?.[m.id];
                          return (
                            <td key={m.id} className="px-3 py-2.5 text-center">
                              {status ? (
                                <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
                                  {status}
                                </span>
                              ) : (
                                <span className="text-neutral-300 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    )}

    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-neutral-800">Daily Attendance</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Mark attendance for each team member by date
        </p>
        </div>
        <button
          onClick={openHistory}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-sm text-neutral-600 font-medium transition-colors shrink-0 mt-1"
        >
          <History size={15} />
          View History
        </button>
      </div>

      {/* Date Picker */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-medium text-neutral-700 mb-3 flex items-center gap-2">
          <Calendar size={16} className="text-warm-400" />
          Select Date
        </h3>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            setSaved(false);
          }}
          className="glass-input max-w-xs"
        />
      </div>

      {/* Attendance Sheet */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200/60 flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-700">
            Team Members &mdash;{" "}
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </h3>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 size={13} />
              Saved
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {members.map((member) => {
              const currentStatus = statusMap[member.id];
              const initials = member.full_name
                ? member.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : "?";

              return (
                <div
                  key={member.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-4 hover:bg-neutral-50/60 transition-colors"
                >
                  {/* Avatar + Name row — always horizontal */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                      style={{ background: "#e06b6b" }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">
                        {member.full_name || member.email?.split('@')[0] || "Unknown"}
                      </p>
                      <p className="text-[10px] text-neutral-400 truncate">
                        {member.email}
                      </p>
                    </div>
                  </div>

                  {/* Radio buttons — indented on mobile to align under the name */}
                  <div className="flex items-center gap-3 pl-11 sm:pl-0">
                    {STATUS_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex items-center gap-1.5 cursor-pointer group"
                      >
                        <div
                          className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all"
                          style={{
                            borderColor: currentStatus === opt.value ? opt.activeColor : "rgba(55, 53, 47, 0.16)",
                            backgroundColor: currentStatus === opt.value ? opt.activeColor : "transparent",
                          }}
                          onClick={() => handleStatusChange(member.id, opt.value)}
                        >
                          {currentStatus === opt.value && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                        <span
                          className="text-xs font-medium transition-colors"
                          style={{
                            color: currentStatus === opt.value ? opt.activeColor : "rgba(55, 53, 47, 0.5)",
                          }}
                          onClick={() => handleStatusChange(member.id, opt.value)}
                        >
                          {opt.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

            {members.length === 0 && (
              <div className="py-12 text-center text-neutral-400 text-sm">
                No team members found.
              </div>
            )}
          </div>
        )}

        {/* Save button - Only visible to Admin */}
        {isAdmin && (
          <div className="px-5 py-4 border-t border-neutral-200/60">
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="btn-primary flex items-center gap-2"
            >
              {saving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )}
              {saving ? "Saving..." : "Save Attendance"}
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
