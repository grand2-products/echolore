"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "../auth-service";

const authQueryKey = ["auth"] as const;
const authMeQueryKey = [...authQueryKey, "me"] as const;
const authSessionsQueryKey = [...authQueryKey, "sessions"] as const;

export function useCurrentAuth() {
  return useQuery({
    queryKey: authMeQueryKey,
    queryFn: () => authService.getCurrentAuth(),
    retry: false,
  });
}

export function useCurrentAuthSessions(enabled: boolean) {
  return useQuery({
    queryKey: authSessionsQueryKey,
    queryFn: () => authService.listSessions(),
    enabled,
  });
}

export function useRevokeCurrentAuthSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => authService.revokeSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authSessionsQueryKey });
    },
  });
}

export async function invalidateAuthQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: authQueryKey });
}
