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
    </SettingsSectionShell>
  );
}
