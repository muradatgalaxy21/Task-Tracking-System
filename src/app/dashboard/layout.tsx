"use client";

// Dashboard layout: sidebar + main content area.
// WorkspaceProvider must be inside AuthProvider because it reads the current user.

import { AuthProvider } from "@/components/providers/AuthProvider";
import { WorkspaceProvider } from "@/components/providers/WorkspaceProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import Sidebar from "@/components/layout/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <ThemeProvider>
          <div className="min-h-screen bg-gradient-radial">
            <Sidebar />
            <main className="ml-[260px] p-6 lg:p-8 transition-all duration-200">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
