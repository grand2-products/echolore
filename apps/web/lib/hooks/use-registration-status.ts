"use client";

import { useQuery } from "@tanstack/react-query";
import { authApi } from "../api";

export function useRegistrationStatus() {
  return useQuery({
    queryKey: ["auth", "registration-status"],
    queryFn: () => authApi.registrationStatus(),
    retry: false,
  });
}
