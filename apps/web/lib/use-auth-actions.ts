"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getGoogleSignInUrl, logoutCurrentUser } from "./auth-flow";
import { buildCurrentReturnTo, normalizeReturnTo } from "./return-to";
import { invalidateAuthQueries } from "./use-auth-session";

export function useAuthActions(options?: { returnTo?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const currentReturnTo = options?.returnTo ?? buildCurrentReturnTo(pathname, searchParams);

  const logout = async () => {
    await logoutCurrentUser();
    // logoutCurrentUser redirects via window.location.assign, so the following
    // is only reached if the redirect is somehow blocked.
    await invalidateAuthQueries(queryClient);
    router.replace("/login");
    router.refresh();
  };

  return {
    googleSignInUrl: getGoogleSignInUrl(normalizeReturnTo(currentReturnTo)),
    logout,
  };
}
