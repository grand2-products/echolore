"use client";

import type { AuthMeResponse } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getGoogleSignInUrl, logoutCurrentUser } from "./auth-flow";
import { invalidateAuthQueries } from "./use-auth-session";

export function useAuthActions() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const logout = async (authMode: AuthMeResponse["authMode"]) => {
    await logoutCurrentUser(authMode, {
      onSignedOut: async () => {
        await invalidateAuthQueries(queryClient);
        router.replace("/login");
        router.refresh();
      },
    });
  };

  return {
    googleSignInUrl: getGoogleSignInUrl(),
    logout,
  };
}
