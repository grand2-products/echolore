"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authService } from "./auth-service";
import { normalizeReturnTo } from "./return-to";
import { useStableEvent } from "./use-stable-event";
import { invalidateAuthQueries } from "./use-auth-session";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "";

async function signInWithCredentials(input: { email: string; password: string }, callbackUrl: string) {
  // 1. Fetch CSRF token from Auth.js
  const csrfRes = await fetch(`${apiBase}/api/auth/csrf`, { credentials: "include" });
  if (!csrfRes.ok) throw new Error("Failed to fetch CSRF token");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  // 2. POST to Auth.js Credentials callback
  const res = await fetch(`${apiBase}/api/auth/callback/credentials`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      email: input.email,
      password: input.password,
      callbackUrl,
    }),
    redirect: "manual",
  });

  // Auth.js returns a redirect on success (302) or an error page
  if (res.type === "opaqueredirect" || res.status === 302 || res.status === 200) {
    return;
  }

  throw new Error("Invalid email or password");
}

export function usePasswordAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const completeAuthenticatedRedirect = useStableEvent(async (returnTo?: string | null) => {
    const destination = normalizeReturnTo(returnTo) ?? "/";
    await invalidateAuthQueries(queryClient);
    router.replace(destination);
    router.refresh();
  });

  const signIn = useStableEvent(async (
    input: { email: string; password: string },
    returnTo?: string | null,
  ) => {
    const destination = normalizeReturnTo(returnTo) ?? "/";
    const callbackUrl = typeof window !== "undefined"
      ? new URL(destination, window.location.origin).toString()
      : destination;
    await signInWithCredentials(input, callbackUrl);
    await completeAuthenticatedRedirect(returnTo);
  });

  const register = useStableEvent(async (
    input: { name: string; email: string; password: string },
    returnTo?: string | null,
  ) => {
    const result = await authService.registerWithPassword(input);
    // First user is created immediately without email verification — auto sign-in
    if (result.immediate) {
      await signIn({ email: input.email, password: input.password }, returnTo);
    }
    return result;
  });

  const verifyEmail = useStableEvent(async (token: string, _returnTo?: string | null) => {
    // Verify email through our API (creates user + identity).
    // After verification the user needs to manually sign in with their
    // credentials to establish an Auth.js session cookie.
    await authService.verifyEmailToken(token);
  });

  return {
    signIn,
    register,
    verifyEmail,
  };
}
