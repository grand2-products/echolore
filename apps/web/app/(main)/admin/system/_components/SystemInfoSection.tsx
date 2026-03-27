"use client";

import { useT } from "@/lib/i18n";
import { SettingsSectionShell } from "../../settings/_components/SettingsSectionShell";

const GITHUB_URL = "https://github.com/grand2-products/echolore";

export function SystemInfoSection() {
  const t = useT();

  return (
    <SettingsSectionShell
      title={t("admin.systemInfo.title")}
      description={t("admin.systemInfo.description")}
      error={null}
      notice={null}
    >
      <div className="space-y-2">
        {process.env.NEXT_PUBLIC_APP_VERSION && (
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <span className="text-sm text-gray-600">{t("admin.systemInfo.version")}</span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-mono font-medium text-gray-800">
              {process.env.NEXT_PUBLIC_APP_VERSION}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
          <span className="text-sm text-gray-600">{t("admin.systemInfo.repository")}</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-blue-600 hover:text-blue-500 hover:underline"
          >
            {GITHUB_URL.replace("https://github.com/", "")}
          </a>
        </div>
      </div>
    </SettingsSectionShell>
  );
}
