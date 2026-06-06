"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { hasMinimumRole, resolveEffectiveRole } from "@/lib/rbac-utils";
import type { Workspace } from "@/lib/types";

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  // The current user's role inside the active workspace (from WorkspaceMember.role)
  workspaceRole: string | null;
  // True if effective role (max of global and workspace-local) is Admin or above
  isWorkspaceAdmin: boolean;
  // True if effective role is Manager or above (can create tasks, edit titles)
  isWorkspaceManager: boolean;
  setActiveWorkspace: (ws: Workspace) => void;
  refreshWorkspaces: () => Promise<void>;
  wsLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  activeWorkspace: null,
  workspaceRole: null,
  isWorkspaceAdmin: false,
  isWorkspaceManager: false,
  setActiveWorkspace: () => {},
  refreshWorkspaces: async () => {},
  wsLoading: true,
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  // authLoading is needed so we can distinguish "session still resolving" from "no user"
  const { user, loading: authLoading } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [wsLoading, setWsLoading] = useState(true);

  // Persist the active workspace ID per user so selection survives page reloads
  const storageKey = user?.id ? `activeWorkspaceId:${user.id}` : null;

  const fetchWorkspaces = useCallback(async () => {
    if (!user?.id) return;
    const savedId = storageKey ? localStorage.getItem(storageKey) : null;
    try {
      const res = await fetch("/api/workspaces");
      if (!res.ok) return;
      const data: Workspace[] = await res.json();
      setWorkspaces(data);
      setActiveWorkspaceState((prev) => {
        // If a workspace is already active in memory and still exists, refresh its object
        if (prev && data.find((w) => w.id === prev.id)) {
          return data.find((w) => w.id === prev.id) ?? prev;
        }
        // Restore the last workspace the user had selected (persisted in localStorage)
        if (savedId) {
          const saved = data.find((w) => w.id === savedId);
          if (saved) return saved;
        }
        // Fall back to first workspace only when no saved preference exists
        return data[0] ?? null;
      });
    } catch (err) {
      console.error("Failed to fetch workspaces:", err);
    } finally {
      setWsLoading(false);
    }
  }, [user?.id, storageKey]);

  useEffect(() => {
    // Session is still resolving — wait before making any decisions
    if (authLoading) return;

    // Auth has settled with no user (unauthenticated) — nothing to fetch, unblock wsLoading
    if (!user?.id) {
      setWsLoading(false);
      return;
    }

    // User is confirmed — fetch their workspaces
    fetchWorkspaces();
  }, [user?.id, authLoading, fetchWorkspaces]);

  const setActiveWorkspace = (ws: Workspace) => {
    setActiveWorkspaceState(ws);
    // Persist the choice so the next page load restores it instead of defaulting to first
    if (storageKey) localStorage.setItem(storageKey, ws.id);
  };

  // Workspace-local role for the active workspace
  const workspaceRole = activeWorkspace?.member_role ?? null;

  const globalRole        = user?.role ?? "Guest";
  const effectiveRole     = resolveEffectiveRole(globalRole, workspaceRole);
  const isWorkspaceAdmin  = hasMinimumRole(effectiveRole, "Admin");
  const isWorkspaceManager = hasMinimumRole(effectiveRole, "Manager");

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        workspaceRole,
        isWorkspaceAdmin,
        isWorkspaceManager,
        setActiveWorkspace,
        refreshWorkspaces: fetchWorkspaces,
        wsLoading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
