"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

/**
 * AccountDeletedPage renders a goodbye screen to the user after successful deletion.
 * 
 * Key layout points:
 * 1. Displays a success icon indicating deletion completed.
 * 2. Informs the user that their data has been removed and ownership transferred where applicable.
 * 3. Provides a clean return link back to the login page.
 */
export default function AccountDeletedPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-50 px-4"
      style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-red-600" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Account Permanently Deleted
        </h1>

        <p className="text-sm text-gray-500 mb-8 leading-relaxed">
          Your account and all associated data have been permanently removed. 
          If you transferred workspace ownership, those workspaces will continue to be active under the new owners.
        </p>

        <Link
          href="/login"
          className="inline-block w-full py-2.5 rounded-lg bg-[#7b2c51] text-white text-sm font-semibold hover:bg-[#621f3e] active:scale-[0.98] transition-all text-center shadow-sm"
        >
          Return to Sign In
        </Link>
      </div>
    </div>
  );
}
