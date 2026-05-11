"use client";

// -------------------------------------------------------------------
// Daily Attendance Sheet Page (Admin Only)
// Admin selects a date and marks Present / Late / Absent for each
// team member. Records are upserted into the daily_attendance table.
// Restyled for warm light theme.
// -------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Profile, DailyAttendance, AttendanceStatus } from "@/lib/types";
import { Calendar, Save, ShieldAlert, Loader2, CheckCircle2 } from "lucide-react";

// Status options for the radio button group
const STATUS_OPTIONS: { value: AttendanceStatus; label: string; activeColor: string }[] =
  [
    { value: "Present", label: "Present", activeColor: "#448361" },
    { value: "Late", label: "Late", activeColor: "#cb912f" },
    { value: "Absent", label: "Absent", activeColor: "#e06b6b" },
  ];

export default function AttendancePage() {
  const { isAdmin, loading: authLoading, refreshKey } = useAuth();
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch all member profiles
  const fetchMembers = useCallback(async () => {
    try {
      const response = await fetch("/api/members");
      if (!response.ok) throw new Error("Failed to fetch members");
      const data = await response.json();
      setMembers(data);
    } catch (err) {
      console.error("Failed to fetch members:", err);
    }
  }, []);

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

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers, refreshKey]);

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

  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-96 rounded-xl" />
      </div>
    );
  }

  // Permission check removed as per request to make attendance visible for everyone


  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-neutral-800">Daily Attendance</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Mark attendance for each team member by date
        </p>
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
                  className="flex items-center gap-4 px-5 py-4 hover:bg-neutral-50/60 transition-colors"
                >
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                    style={{ background: "#e06b6b" }}
                  >
                    {initials}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-800 truncate">
                      {member.full_name || member.email?.split('@')[0] || "Unknown"}
                    </p>
                    <p className="text-[10px] text-neutral-400 truncate">
                      {member.email}
                    </p>
                  </div>

                  {/* Radio buttons */}
                  <div className="flex items-center gap-3">
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
  );
}
