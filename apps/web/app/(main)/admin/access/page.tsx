"use client";

import {
  adminApi,
  type AdminGroup,
  type AdminUserRecord,
  type Page,
  type Space,
  wikiApi,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useStableEvent } from "@/lib/hooks/use-stable-event";
import { useEffect, useState } from "react";
import { GroupManagementSection } from "./_components/GroupManagementSection";
import { UserMembershipSection } from "./_components/UserMembershipSection";
import { PagePermissionsSection } from "./_components/PagePermissionsSection";
import { SpacePermissionsSection } from "./_components/SpacePermissionsSection";

export default function AdminAccessPage() {
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
    const [groupResult, userResult] = await Promise.all([adminApi.listGroups(), adminApi.listUsers()]);
    setGroups(groupResult.groups);
    setUsers(userResult.users);
  };

  return (
    <div className="space-y-6">
        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadAdminData()}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              {t("common.actions.retry")}
            </button>
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            {t("admin.access.loading")}
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <GroupManagementSection
              groups={groups}
              onRefresh={onRefresh}
              setError={setError}
              setNotice={setNotice}
            />
            <UserMembershipSection
              groups={groups}
              users={users}
              onRefresh={onRefresh}
              setError={setError}
              setNotice={setNotice}
            />
            <PagePermissionsSection
              groups={groups}
              pages={pages}
              setError={setError}
              setNotice={setNotice}
            />
            <SpacePermissionsSection
              groups={groups}
              spaces={spaces}
              setError={setError}
              setNotice={setNotice}
            />
          </div>
        )}
    </div>
  );
}
