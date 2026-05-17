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
}

interface AuthContextType {
  user: NextAuthUser | null;
  profile: NextAuthUser | null;
  // Role flags use hierarchy: isAdmin is true for Admin AND Owner
  isOwner: boolean;
  isAdmin: boolean;
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

  const loading = status === "loading";
  const user = session?.user as NextAuthUser | null;

  // Sync profile with DB so names and roles are always fresh
  useEffect(() => {
    if (user?.id) {
      const syncProfile = async () => {
        try {
          const res = await fetch(`/api/members?id=${user.id}`);
          if (res.ok) {
            const data = await res.json();
            const updated: NextAuthUser = {
              id: user.id,
              email: user.email,
              full_name: data.full_name,
              role: data.role || "Member",
            };
            setProfile(updated);

            // Redirect to onboarding if the user has not set their name yet
            if (!updated.full_name && pathname !== "/onboarding") {
              router.push("/onboarding");
            }
          }
        } catch (err) {
          console.error("Failed to sync profile:", err);
        }
      };
      syncProfile();
    } else if (status === "unauthenticated") {
      setProfile(null);
    }
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

  const activeRole = user?.role ?? "Guest";

  // Each flag uses the role hierarchy so an Owner also satisfies isAdmin/isMember
  const isOwner = hasMinimumRole(activeRole, "Owner");
  const isAdmin = hasMinimumRole(activeRole, "Admin");
  const isMember = hasMinimumRole(activeRole, "Member");
  const isGuest = activeRole === "Guest";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: profile || user,
        isOwner,
        isAdmin,
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
