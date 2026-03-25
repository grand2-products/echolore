"use client";

import { useT } from "@/lib/i18n";
import { AdminAccessProvider, useAdminAccess } from "./_components/AdminAccessContext";
import { GroupManagementSection } from "./_components/GroupManagementSection";
import { PagePermissionsSection } from "./_components/PagePermissionsSection";
import { SpacePermissionsSection } from "./_components/SpacePermissionsSection";

function AdminAccessContent() {
  const t = useT();
  const { error, notice, isLoading, loadAdminData } = useAdminAccess();

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
          <GroupManagementSection />
          <PagePermissionsSection />
          <SpacePermissionsSection />
        </div>
      )}
    </div>
  );
}

export default function AdminAccessPage() {
  return (
    <AdminAccessProvider>
      <AdminAccessContent />
    </AdminAccessProvider>
  );
}
