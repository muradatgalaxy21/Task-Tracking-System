"use client";

import React from "react";
import Link from "next/link";
import { MessageSquare, ArrowLeft, Lock } from "lucide-react";

/**
 * ChatPage Component (Temporarily Disabled)
 * Displays a premium placeholder notification to inform the user that the chat feature is offline.
 * 1. Renders a card container with glassmorphic styles and subtle gradient glows.
 * 2. Renders an alert icon with a lock badge representing the disabled state.
 * 3. Renders a "Go Back to Dashboard" navigation link for easy redirect.
 */
export default function ChatPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-neutral-50/50 min-h-[85vh] relative overflow-hidden">
      {/* Decorative gradient blur background */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-warm-400/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-[#e06b6b]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Premium alert card container */}
      <div className="relative overflow-hidden w-full max-w-md bg-white border border-neutral-200/80 rounded-2xl p-8 text-center shadow-lg shadow-neutral-100/50">
        
        {/* Animated icon circle wrapper */}
        <div className="w-16 h-16 rounded-2xl bg-neutral-50 border border-neutral-200/60 flex items-center justify-center text-neutral-400 mx-auto mb-6 relative">
          <MessageSquare size={26} className="text-neutral-500" />
          <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#e06b6b] border-2 border-white flex items-center justify-center text-white shadow-sm">
            <Lock size={11} />
          </div>
        </div>

        {/* Informational messaging */}
        <h1 className="text-base font-bold text-neutral-800 tracking-tight">
          Workspace Chat Paused
        </h1>
        <p className="text-xs text-neutral-500 mt-2.5 leading-relaxed max-w-xs mx-auto">
          The team chat channel is temporarily offline for maintenance or optimization. We will be back online shortly!
        </p>

        {/* Separation border divider */}
        <div className="my-6 border-t border-neutral-100" />

        {/* Go back CTA */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 text-xs font-semibold shadow-sm transition-all hover:scale-[1.02] cursor-pointer"
        >
          <ArrowLeft size={13} />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
