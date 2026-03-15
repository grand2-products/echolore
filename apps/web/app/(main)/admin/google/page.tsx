"use client";

import { useT } from "@/lib/i18n";
import { AuthSettingsSection } from "../settings/_components/AuthSettingsSection";
import { GcpCredentialsSection } from "../settings/_components/GcpCredentialsSection";
import { EmbeddingSettingsSection } from "../settings/_components/EmbeddingSettingsSection";

export default function AdminGooglePage() {
  const t = useT();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{t("admin.google.title")}</h2>
        <p className="mt-1 text-sm text-gray-500">{t("admin.google.description")}</p>
      </div>

      <GcpCredentialsSection />
      <AuthSettingsSection />
      <EmbeddingSettingsSection />
    </div>
  );
}
