"use client";

import type { AuthMeResponse } from "./api";
import { createContext, useContext } from "react";
import { useCurrentAuth } from "./use-auth-session";

type AuthContextValue = ReturnType<typeof useCurrentAuth> & {
  user: AuthMeResponse["user"];
  authMode: AuthMeResponse["authMode"];
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authQuery = useCurrentAuth();
  const value: AuthContextValue = {
    ...authQuery,
    user: authQuery.data?.user ?? null,
    authMode: authQuery.data?.authMode ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }

  return value;
}
