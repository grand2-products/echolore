"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import {
  type AdminGroup,
  type AdminUserRecord,
  adminApi,
  type Page,
  type Space,
  wikiApi,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useStableEvent } from "@/lib/hooks/use-stable-event";
import { useT } from "@/lib/i18n";

type AdminAccessContextValue = {
  groups: AdminGroup[];
  users: AdminUserRecord[];
  pages: Page[];
  spaces: Space[];
  error: string | null;
  notice: string | null;
  isLoading: boolean;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
  onRefresh: () => Promise<void>;
  loadAdminData: () => Promise<void>;
};

const AdminAccessContext = createContext<AdminAccessContextValue | null>(null);

export function useAdminAccess(): AdminAccessContextValue {
  const ctx = useContext(AdminAccessContext);
  if (!ctx) {
    throw new Error("useAdminAccess must be used within an AdminAccessProvider");
  }
  return ctx;
}

export function AdminAccessProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAdminData = useStableEvent(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [groupResult, userResult, pageResult, spaceResult] = await Promise.all([
        adminApi.listGroups(),
        adminApi.listUsers(),
        wikiApi.listPages(),
        wikiApi.listSpaces(),
      ]);

      setGroups(groupResult.groups);
      setUsers(userResult.users);
      setPages(pageResult.pages);
      setSpaces(spaceResult.spaces);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t("admin.access.loadError")));
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const onRefresh = async () => {
    const [groupResult, userResult] = await Promise.all([
      adminApi.listGroups(),
      adminApi.listUsers(),
    ]);
    setGroups(groupResult.groups);
    setUsers(userResult.users);
  };

  return (
    <AdminAccessContext.Provider
      value={{
        groups,
        users,
        pages,
        spaces,
        error,
        notice,
        isLoading,
        setError,
        setNotice,
        onRefresh,
        loadAdminData,
      }}
    >
      {children}
    </AdminAccessContext.Provider>
  );
}
