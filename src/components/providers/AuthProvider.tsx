"use client";

import { createContext, useContext, ReactNode, useState, useCallback, useEffect } from "react";
import { useSession, signOut as nextAuthSignOut, SessionProvider } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";

// Define a type that mimics the previous Supabase user to minimize refactoring
export interface NextAuthUser {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role: string;
}

interface AuthContextType {
  user: NextAuthUser | null;
  profile: NextAuthUser | null; // Merged for NextAuth
  isAdmin: boolean;
  loading: boolean;
  refreshKey: number;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isAdmin: false,
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

  const loading = status === "loading";
  const user = session?.user as NextAuthUser | null;
  const [profile, setProfile] = useState<NextAuthUser | null>(null);

  // Sync profile with DB to ensure names are always fresh
  useEffect(() => {
    if (user?.id) {
      const syncProfile = async () => {
        try {
          const res = await fetch(`/api/members?id=${user.id}`);
          if (res.ok) {
            const data = await res.json();
            const updatedProfile = {
              id: user.id,
              email: user.email,
              full_name: data.full_name,
              role: data.role || "Member",
            };
            setProfile(updatedProfile);

            // Force onboarding if full_name is missing
            if (!updatedProfile.full_name && pathname !== "/onboarding") {
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
    setRefreshKey(prev => prev + 1);
  }, []);

  // Handle Tab Wake-Up (Global Session Recovery)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setRefreshKey((prev) => prev + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const isAdmin = user?.role === "Admin";

  return (
    <AuthContext.Provider
      value={{ user, profile: profile || user, isAdmin, loading, refreshKey, signOut, refreshProfile }}
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
