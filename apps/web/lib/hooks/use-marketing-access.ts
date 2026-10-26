"use client";

import type { MarketingPermission } from "@echolore/shared/contracts";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { marketingApi, queryKeys } from "@/lib/api";

/**
 * The current user's marketing permissions. The server enforces every check;
 * this only drives what the UI offers.
 */
export function useMarketingAccess(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.marketingAccess,
    queryFn: () => marketingApi.access(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled,
  });
  const permissions = query.data?.permissions ?? [];
  const can = useCallback(
    (permission: MarketingPermission) => permissions.includes(permission),
    [permissions]
  );
  return {
    ...query,
    permissions,
    can,
    canView: permissions.includes("marketing.view"),
  };
}
