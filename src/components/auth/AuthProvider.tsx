"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { AuthUser } from "@/lib/auth/types";
import {
  canAccessModule,
  hasBusinessUnit,
  hasPermission,
  hasRole,
  isOwnerRole,
} from "@/lib/auth/rbac";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LOGIN_PATH } from "@/lib/config/app";

type AuthContextValue = {
  user: AuthUser | null;
  profile: AuthUser | null;
  role: string | null;
  permissions: string[];
  businessUnits: AuthUser["businessUnits"];
  isLoading: boolean;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  hasBusinessUnit: (unit: string) => boolean;
  canAccessModule: (moduleCode: string) => boolean;
  isSuperAdmin: () => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  children,
}: {
  user: AuthUser | null;
  children: ReactNode;
}) {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && window.location.pathname !== LOGIN_PATH) {
        window.location.assign(LOGIN_PATH);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const identity = user
      ? {
          role: user.roleCode,
          modules: user.modules,
          permissions: user.permissions,
        }
      : null;

    return {
      user,
      profile: user,
      role: user?.roleCode ?? null,
      permissions: user?.permissions ?? [],
      businessUnits: user?.businessUnits ?? [],
      isLoading: false,
      isAuthenticated: Boolean(user),
      hasPermission: (permission) =>
        identity ? hasPermission(identity, permission) : false,
      hasRole: (role) => (user ? hasRole({ role: user.roleCode }, role) : false),
      hasBusinessUnit: (unit) =>
        user ? hasBusinessUnit(user.modules, unit) : false,
      canAccessModule: (moduleCode) =>
        identity ? canAccessModule(identity, moduleCode) : false,
      isSuperAdmin: () => (user ? isOwnerRole(user.roleCode) : false),
    };
  }, [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
