"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useCallback,
  useEffect,
} from "react";
import {
  useSession,
  signOut as nextAuthSignOut,
  SessionProvider,
} from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { hasMinimumRole } from "@/lib/rbac-utils";

export interface NextAuthUser {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role: string;
  image?: string | null;
}

interface AuthContextType {
  user: NextAuthUser | null;
  profile: NextAuthUser | null;
  // Role flags use hierarchy: isAdmin is true for Admin AND Owner
  isOwner: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isMember: boolean;
  isGuest: boolean;
  loading: boolean;
  refreshKey: number;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isOwner: false,
  isAdmin: false,
  isManager: false,
  isMember: false,
  isGuest: false,
  loading: true,
  refreshKey: 0,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProviderInner({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [refreshKey, setRefreshKey] = useState(0);
  const [profile, setProfile] = useState<NextAuthUser | null>(null);

  // profileReady is a one-way gate: false until the first DB profile fetch settles.
  // It never resets to false on subsequent background refreshes, so re-syncing on tab
  // focus does not flash the skeleton after the initial load.
  const [profileReady, setProfileReady] = useState(false);

  const sessionLoading = status === "loading";
  const user = session?.user as NextAuthUser | null;

  // Combined loading: true while the session is resolving OR the first profile fetch
  // has not yet completed. Once profileReady is true it stays true permanently.
  const loading = sessionLoading || !profileReady;

  // Sync profile with DB so names and roles are always fresh
  useEffect(() => {
    if (!user?.id) {
      // Auth settled with no user — release the loading gate and clear any stale profile
      if (!sessionLoading) {
        setProfile(null);
        setProfileReady(true);
      }
      return;
    }

    const syncProfile = async () => {
      try {
        const res = await fetch(`/api/members?id=${user.id}`);
        if (res.ok) {
          const data = await res.json();
          if (!data) {
            console.warn("User not found in database, clearing profile");
            setProfile(null);
            // If the DB was reset, clear the NextAuth session too
            await nextAuthSignOut({ callbackUrl: "/login" });
            return;
          }

          const updated: NextAuthUser = {
            id: user.id,
            email: user.email,
            full_name: data.full_name,
            role: data.role || "Member",
            image: data.image || null,
          };
          setProfile(updated);

          // Redirect to onboarding if the user has not set their name yet
          if (!updated.full_name && pathname !== "/onboarding") {
            router.push("/onboarding");
          }
        }
      } catch (err) {
        console.error("Failed to sync profile:", err);
      } finally {
        // Always release the loading gate, even on fetch errors, so the UI never hangs
        setProfileReady(true);
      }
    };

    syncProfile();
  }, [user?.id, status, refreshKey, pathname, router]);

  const signOut = useCallback(async () => {
    await nextAuthSignOut({ callbackUrl: "/login" });
  }, []);

  const refreshProfile = useCallback(async () => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Re-sync when the tab regains focus (handles session expiry edge cases)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setRefreshKey((prev) => prev + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Prefer the DB-fresh role from profile (populated by syncProfile) over the
  // stale JWT role so that admin-panel role changes are reflected immediately.
  const activeRole = profile?.role ?? user?.role ?? "Guest";

  // Each flag uses the role hierarchy so an Owner also satisfies isAdmin/isManager/isMember
  const isOwner   = hasMinimumRole(activeRole, "Owner");
  const isAdmin   = hasMinimumRole(activeRole, "Admin");
  const isManager = hasMinimumRole(activeRole, "Manager");
  const isMember  = hasMinimumRole(activeRole, "Member");
  const isGuest   = activeRole === "Guest";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: profile || user,
        isOwner,
        isAdmin,
        isManager,
        isMember,
        isGuest,
        loading,
        refreshKey,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthProviderInner>{children}</AuthProviderInner>
    </SessionProvider>
  );
}
