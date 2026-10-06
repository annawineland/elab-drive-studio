import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "teacher" | "student" | null;

interface AuthState {
  user: User | null;
  role: AppRole;
  fullName: string;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Single shared auth state for the whole app. Mounted once in the root route
 * so every useAuth() consumer sees the SAME session — per-component instances
 * would each start at user=null and crash pages that read user.id on first paint.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const profileRequest = useRef(0);

  const loadProfile = useCallback(async (userId: string) => {
    const [rolesResult, profileResult] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);
    if (rolesResult.error) throw rolesResult.error;
    if (profileResult.error) throw profileResult.error;
    const roles = rolesResult.data;
    const profile = profileResult.data;
    const r = (roles?.[0]?.role ?? null) as AppRole;
    return { role: r, fullName: profile?.full_name ?? "" };
  }, []);

  useEffect(() => {
    let mounted = true;

    const hydrateProfile = async (userId: string) => {
      const request = ++profileRequest.current;
      setError(null);
      try {
        const profile = await loadProfile(userId);
        if (!mounted || request !== profileRequest.current) return;
        setRole(profile.role);
        setFullName(profile.fullName);
      } catch (profileError) {
        if (!mounted || request !== profileRequest.current) return;
        setRole(null);
        setError(
          profileError instanceof Error ? profileError.message : "Could not load your account",
        );
      } finally {
        if (mounted && request === profileRequest.current) setLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        // Defer the profile fetch so it never blocks the auth callback.
        setTimeout(() => {
          if (mounted) void hydrateProfile(u.id);
        }, 0);
      } else {
        profileRequest.current += 1;
        setRole(null);
        setFullName("");
        setError(null);
        setLoading(false);
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        void hydrateProfile(u.id);
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    const request = ++profileRequest.current;
    setLoading(true);
    setError(null);
    try {
      const profile = await loadProfile(user.id);
      if (request !== profileRequest.current) return;
      setRole(profile.role);
      setFullName(profile.fullName);
    } catch (profileError) {
      if (request !== profileRequest.current) return;
      setRole(null);
      setError(
        profileError instanceof Error ? profileError.message : "Could not load your account",
      );
    } finally {
      if (request === profileRequest.current) setLoading(false);
    }
  }, [user, loadProfile]);

  return (
    <AuthContext.Provider value={{ user, role, fullName, loading, error, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
