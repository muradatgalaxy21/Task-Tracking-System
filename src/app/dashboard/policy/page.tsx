"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useRouter } from "next/navigation";
import {
  Shield,
  Clock,
  Zap,
  Users,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

export default function PolicyPage() {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();

  // If user has not accepted the policy yet, we show a premium inline banner to allow acceptance right on the page
  const hasAccepted = profile?.accepted_privacy_policy;

  const handleAccept = async () => {
    try {
      const res = await fetch("/api/settings/accept-policy", {
        method: "POST",
      });
      if (res.ok) {
        await refreshProfile();
        router.push("/dashboard");
      }
    } catch (err) {
      console.error("Failed to accept policy on page:", err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-6 animate-fade-in pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200/80 pb-6">
        <div>
          <button
            onClick={() => router.back()}
            id="back-button"
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors mb-3 cursor-pointer"
          >
            <ArrowLeft size={14} />
            Back to previous page
          </button>
          <h1 className="text-2xl font-bold text-neutral-800 tracking-tight">
            System Policy & Terms of Service
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Last Updated: June 21, 2026
          </p>
        </div>

        {hasAccepted ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-semibold self-start md:self-center">
            <CheckCircle2 size={14} />
            Agreed to Policies
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500 font-medium hidden sm:inline">
              Agreement required to continue
            </span>
            <button
              onClick={handleAccept}
              id="accept-policy-page-button"
              className="btn-primary text-xs py-2 px-5 shadow-md font-semibold"
            >
              Accept & Continue
            </button>
          </div>
        )}
      </div>

      {/* Main sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column navigation cards */}
        <div className="space-y-4 md:col-span-1">
          <div className="glass-card p-5 space-y-4 sticky top-6">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
              Sections
            </h3>
            <nav className="space-y-2">
              <a
                href="#data-collection"
                className="block text-xs font-medium text-neutral-600 hover:text-[#e06b6b] transition-colors"
              >
                1. Data Collection & Cookies
              </a>
              <a
                href="#scoring-system"
                className="block text-xs font-medium text-neutral-600 hover:text-[#e06b6b] transition-colors"
              >
                2. Score Calculations (TPS & AS)
              </a>
              <a
                href="#multipliers-penalties"
                className="block text-xs font-medium text-neutral-600 hover:text-[#e06b6b] transition-colors"
              >
                3. Multipliers & Not Done Penalty
              </a>
              <a
                href="#attendance-rules"
                className="block text-xs font-medium text-neutral-600 hover:text-[#e06b6b] transition-colors"
              >
                4. Attendance Tiers & Payouts
              </a>
            </nav>
            <div className="pt-4 border-t border-neutral-100 text-[10px] text-neutral-400 leading-normal">
              By using this tracking system, you acknowledge that your task logs, deadlines, attendance check-ins, and performance values are collected and processed for administrative and payouts logic.
            </div>
          </div>
        </div>

        {/* Right column main policy content */}
        <div className="md:col-span-2 space-y-8">
          {/* Section 1 */}
          <section id="data-collection" className="glass-card p-6 space-y-4">
            <h2 className="text-base font-bold text-neutral-800 flex items-center gap-2 border-b border-neutral-100 pb-3">
              <Shield size={18} className="text-[#e06b6b]" />
              1. Data Collection & Cookie Consent
            </h2>
            <div className="text-xs text-neutral-600 space-y-3 leading-relaxed">
              <p>
                The platform securely stores individual member account information, session records, and task ledger history. We collect only what is necessary to run the tracking and salary evaluation engine:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-neutral-500">
                <li>Personal identifiers: Name, email address, profile photo URL.</li>
                <li>System data: Task logs, estimated and actual hours, comments, file attachments.</li>
                <li>Activity Logs: Audited records of task completions, status switches, and workspace settings updates.</li>
              </ul>
              <p>
                <strong>Cookie Usage:</strong> We utilize essential cookies (via NextAuth.js) to manage active user sessions and identify logged-in members. We do not use third-party tracking or advertising cookies.
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section id="scoring-system" className="glass-card p-6 space-y-4">
            <h2 className="text-base font-bold text-neutral-800 flex items-center gap-2 border-b border-neutral-100 pb-3">
              <Zap size={18} className="text-amber-500" />
              2. Score Calculations (TPS &amp; AS)
            </h2>
            <div className="text-xs text-neutral-600 space-y-3 leading-relaxed">
              <p>
                A member&apos;s monthly performance is represented by a composite score out of 100 points, broken down into two distinct sub-scores:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div className="bg-neutral-50 dark:bg-neutral-850 p-3.5 rounded-xl border border-neutral-150/40">
                  <p className="font-semibold text-neutral-800">Task Performance Score (TPS)</p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Accounts for a maximum of <strong>65 points</strong>. Calculated as the flat average multiplier of all completed tasks in a calendar month multiplied by 65. Clamped at a minimum of 0 points.
                  </p>
                </div>
                <div className="bg-neutral-50 dark:bg-neutral-850 p-3.5 rounded-xl border border-neutral-150/40">
                  <p className="font-semibold text-neutral-800">Attendance Score (AS)</p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Accounts for a maximum of <strong>35 points</strong>. Calculated as <code>(Weighted Present Days / Active Days in Month) * 35</code>. 
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section id="multipliers-penalties" className="glass-card p-6 space-y-4">
            <h2 className="text-base font-bold text-neutral-800 flex items-center gap-2 border-b border-neutral-100 pb-3">
              <Clock size={18} className="text-blue-500" />
              3. Task Multipliers and &quot;Not Done&quot; Penalties
            </h2>
            <div className="text-xs text-neutral-600 space-y-3 leading-relaxed">
              <p>
                To reward on-time delivery and enforce accountability, every completed task is assigned a performance multiplier based on the exact delivery timestamp relative to the deadline:
              </p>
              <div className="overflow-x-auto mt-2">
                <table className="w-full border-collapse border border-neutral-200 text-left">
                  <thead>
                    <tr className="bg-neutral-50 text-neutral-700">
                      <th className="px-3 py-2 font-semibold">Completion Time</th>
                      <th className="px-3 py-2 font-semibold text-right">Multiplier</th>
                      <th className="px-3 py-2 font-semibold">Assessment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 text-neutral-500">
                    <tr>
                      <td className="px-3 py-2 text-neutral-700 font-medium">On-Time Delivery</td>
                      <td className="px-3 py-2 text-right font-bold text-green-600">1.0x</td>
                      <td className="px-3 py-2">Full score credit</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Up to 24 Hours Late</td>
                      <td className="px-3 py-2 text-right font-bold text-amber-600">0.6x</td>
                      <td className="px-3 py-2">40% penalty applied</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">24 to 48 Hours Late</td>
                      <td className="px-3 py-2 text-right font-bold text-orange-500">0.4x</td>
                      <td className="px-3 py-2">60% penalty applied</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">More than 48 Hours Late</td>
                      <td className="px-3 py-2 text-right font-bold text-red-500">0.0x</td>
                      <td className="px-3 py-2">No score credit</td>
                    </tr>
                    <tr className="bg-red-50/20">
                      <td className="px-3 py-2 text-red-700 font-semibold">Marked as &quot;Not Done&quot;</td>
                      <td className="px-3 py-2 text-right font-bold text-red-700">-1.0x</td>
                      <td className="px-3 py-2 text-red-700">Flat penalty deduction</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                <strong>&quot;Not Done&quot; Penalty:</strong> Marking a task as &quot;Not Done&quot; represents an incomplete assignment and subtracts `-1.0` from the monthly multiplier calculation, pulling down the overall Task Performance Score.
              </p>
            </div>
          </section>

          {/* Section 4 */}
          <section id="attendance-rules" className="glass-card p-6 space-y-4">
            <h2 className="text-base font-bold text-neutral-800 flex items-center gap-2 border-b border-neutral-100 pb-3">
              <Users size={18} className="text-green-600" />
              4. Attendance Tiers &amp; Payouts logic
            </h2>
            <div className="text-xs text-neutral-600 space-y-3 leading-relaxed">
              <p>
                Attendance is recorded daily by the workspace administrators. We distinguish three tiers:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-neutral-500">
                <li><strong className="text-green-600">Present</strong>: Counts as `1.0` attendance day.</li>
                <li><strong className="text-amber-500">Late</strong>: Applied to logins recorded after the system cut-off. Counts as `0.5` attendance day.</li>
                <li><strong className="text-red-500">Absent</strong>: Counts as `0.0` day.</li>
              </ul>
              <p>
                <strong>Payout Splits:</strong> Total revenue generated in a workspace is closed at month-end under a 3-tier layout:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-neutral-500">
                <li><strong>60% Retained Treasury</strong>: Retained by the company for overheads and reserves.</li>
                <li><strong>24% Base Payout Pool</strong>: Distributed equally among all active workspace members.</li>
                <li><strong>16% Performance Payout Pool</strong>: Distributed proportionally according to each member&apos;s final composite score (max 100).</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
