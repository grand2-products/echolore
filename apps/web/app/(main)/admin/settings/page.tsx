"use client";

import { useCallback, useState } from "react";
import { useT } from "@/lib/i18n";
import { useSiteSettings } from "@/lib/site-settings-context";
import { BackupSettingsSection } from "./_components/BackupSettingsSection";
import { CoworkingVideoSection } from "./_components/CoworkingVideoSection";
import { EmailSettingsSection } from "./_components/EmailSettingsSection";
import { GithubSettingsSection } from "./_components/GithubSettingsSection";
import { MeetingVideoSection } from "./_components/MeetingVideoSection";
import { SiteIconSection } from "./_components/SiteIconSection";
import { SiteSettingsSection } from "./_components/SiteSettingsSection";
import { StorageSettingsSection } from "./_components/StorageSettingsSection";
import { TestConnectionModal, type TestModalState } from "./_components/TestConnectionModal";

interface SiteLoadedData {
  hasSiteIcon: boolean;
  mtgSimulcast: boolean;
  mtgDynacast: boolean;
  mtgAdaptiveStream: boolean;
  cwSimulcast: boolean;
  cwDynacast: boolean;
  cwAdaptiveStream: boolean;
  cwMode: "sfu" | "mcu";
  cwMcuWidth: number;
  cwMcuHeight: number;
  cwMcuFps: number;
  cwFocusIdentity: string;
}

export default function AdminSettingsPage() {
  const t = useT();
  const { refetch: refetchSiteSettings } = useSiteSettings();

  const [testModal, setTestModal] = useState<TestModalState | null>(null);
  const [siteData, setSiteData] = useState<SiteLoadedData | null>(null);

  const handleSiteLoaded = useCallback((data: SiteLoadedData) => {
    setSiteData(data);
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <SiteSettingsSection
        refetchSiteSettings={refetchSiteSettings}
        onLoadedSiteSettings={handleSiteLoaded}
      />

      {siteData ? (
        <>
          <SiteIconSection initialHasSiteIcon={siteData.hasSiteIcon} />
          <EmailSettingsSection />
          <MeetingVideoSection
            refetchSiteSettings={refetchSiteSettings}
            initialSimulcast={siteData.mtgSimulcast}
            initialDynacast={siteData.mtgDynacast}
            initialAdaptiveStream={siteData.mtgAdaptiveStream}
          />
          <CoworkingVideoSection
            refetchSiteSettings={refetchSiteSettings}
            initialSimulcast={siteData.cwSimulcast}
            initialDynacast={siteData.cwDynacast}
            initialAdaptiveStream={siteData.cwAdaptiveStream}
            initialMode={siteData.cwMode}
            initialMcuWidth={siteData.cwMcuWidth}
            initialMcuHeight={siteData.cwMcuHeight}
            initialMcuFps={siteData.cwMcuFps}
            initialFocusIdentity={siteData.cwFocusIdentity}
          />
          <StorageSettingsSection onTestModal={setTestModal} />
          <BackupSettingsSection onTestModal={setTestModal} />
          <GithubSettingsSection />
        </>
      ) : (
        <div className="space-y-6">
          {["s0", "s1", "s2", "s3", "s4", "s5"].map((key) => (
            <div key={key} className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
                {t("admin.settings.loading")}
              </div>
            </div>
          ))}
        </div>
      )}

      {testModal && <TestConnectionModal modal={testModal} onClose={() => setTestModal(null)} />}
    </div>
  );
}
