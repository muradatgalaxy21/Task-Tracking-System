"use client";

// -------------------------------------------------------------------
// Dashboard Layout
// Wraps all authenticated pages with sidebar navigation.
// Provides AuthProvider context to all child pages.
// Uses light theme with warm off-white background.
// -------------------------------------------------------------------

import { AuthProvider } from "@/components/providers/AuthProvider";
import Sidebar from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gradient-radial">
        <Sidebar />
        {/* Main content area with sidebar offset */}
        <main className="ml-[260px] p-6 lg:p-8 transition-all duration-200">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
