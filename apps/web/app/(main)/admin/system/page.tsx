"use client";

import { SystemInfoSection } from "./_components/SystemInfoSection";
import { SystemUpdateSection } from "./_components/SystemUpdateSection";

export default function AdminSystemPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <SystemInfoSection />
      <SystemUpdateSection />
    </div>
  );
}
