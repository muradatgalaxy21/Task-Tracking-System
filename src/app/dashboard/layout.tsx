"use client";

// Dashboard layout: sidebar + main content area.
// WorkspaceProvider must be inside AuthProvider because it reads the current user.

import { useState } from "react";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { WorkspaceProvider } from "@/components/providers/WorkspaceProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import Sidebar from "@/components/layout/Sidebar";
import NotificationsBell from "@/components/layout/NotificationsBell";
import { Menu } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <AuthProvider>
      <WorkspaceProvider>
        <ThemeProvider>
          <div className="min-h-screen bg-gradient-radial">
            {/* Mobile top header — only visible below md breakpoint */}
            <header className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 bg-white/90 backdrop-blur-sm border-b border-neutral-200/60">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="p-2 -ml-1 rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors"
                  aria-label="Open navigation menu"
                >
                  <Menu size={20} />
                </button>
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "linear-gradient(135deg, #e06b6b, #c85555)" }}
                  >
                    <span className="text-white text-[10px] font-bold">AB</span>
                  </div>
                  <span className="text-sm font-semibold text-neutral-800">AI & Beyond</span>
                </div>
              </div>
              <NotificationsBell />
            </header>

            <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

            {/* Desktop top-right floating bell */}
            <div className="fixed top-6 right-6 z-40 hidden md:block">
              <NotificationsBell />
            </div>

            {/* Main content: no left margin on mobile, offset for sidebar on desktop */}
            <main className="md:ml-[260px] pt-14 md:pt-0 p-4 md:p-6 lg:p-8 transition-all duration-200">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
