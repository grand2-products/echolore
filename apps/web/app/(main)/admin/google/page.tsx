"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { AuthSettingsSection } from "../settings/_components/AuthSettingsSection";
import { DriveSettingsSection } from "../settings/_components/DriveSettingsSection";
import { EmbeddingSettingsSection } from "../settings/_components/EmbeddingSettingsSection";
import { GcpCredentialsSection } from "../settings/_components/GcpCredentialsSection";
import {
  TestConnectionModal,
  type TestModalState,
} from "../settings/_components/TestConnectionModal";

export default function AdminGooglePage() {
  const t = useT();
  const [testModal, setTestModal] = useState<TestModalState | null>(null);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{t("admin.google.title")}</h2>
        <p className="mt-1 text-sm text-gray-500">{t("admin.google.description")}</p>
      </div>

      <GcpCredentialsSection onTestModal={setTestModal} />
      <AuthSettingsSection />
      <EmbeddingSettingsSection />
      <DriveSettingsSection />

      {testModal && <TestConnectionModal modal={testModal} onClose={() => setTestModal(null)} />}
    </div>
  );
}
