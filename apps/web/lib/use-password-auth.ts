"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authService } from "./auth-service";
import { useStableEvent } from "./use-stable-event";
import { invalidateAuthQueries } from "./use-auth-session";

export function usePasswordAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const completeAuthenticatedRedirect = useStableEvent(async () => {
    await invalidateAuthQueries(queryClient);
    router.replace("/");
    router.refresh();
  });

  const signIn = useStableEvent(async (input: { email: string; password: string }) => {
    await authService.loginWithPassword(input);
    await completeAuthenticatedRedirect();
  });

  const register = useStableEvent(async (input: { name: string; email: string; password: string }) => {
    await authService.registerWithPassword(input);
  });

  const verifyEmail = useStableEvent(async (token: string) => {
    await authService.verifyEmailToken(token);
    await completeAuthenticatedRedirect();
  });

  return {
    signIn,
    register,
    verifyEmail,
  };
}
