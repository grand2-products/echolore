"use client";

import type { MarketingSettingsDto } from "@echolore/shared/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Field, inputClass, Notice, useAction } from "@/components/marketing/ui";
import { ErrorBanner } from "@/components/ui";
import { marketingApi, queryKeys } from "@/lib/api";
import { useMarketingAccess } from "@/lib/hooks/use-marketing-access";
import { useT } from "@/lib/i18n";

function SettingsForm({ initial }: { initial: MarketingSettingsDto }) {
  const t = useT();
  const queryClient = useQueryClient();
  const action = useAction();
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const num = (key: "metricsRetentionMonths" | "runLogRetentionDays" | "staleAfterHours") => ({
    type: "number",
    className: inputClass,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setSaved(false);
      setForm({ ...form, [key]: Number(e.target.value) });
    },
  });

  return (
    <Card>
      {action.error ? <ErrorBanner message={action.error} className="mb-3" /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={t("marketing.settings.metricsRetentionMonths")}
          hint={t("marketing.settings.metricsRetentionHint")}
        >
          <input min={1} max={120} {...num("metricsRetentionMonths")} />
        </Field>
        <Field
          label={t("marketing.settings.runLogRetentionDays")}
          hint={t("marketing.settings.runLogRetentionHint")}
        >
          <input min={7} max={3650} {...num("runLogRetentionDays")} />
        </Field>
        <Field
          label={t("marketing.settings.staleAfterHours")}
          hint={t("marketing.settings.staleHint")}
        >
          <input min={1} max={720} {...num("staleAfterHours")} />
        </Field>
      </div>
      <div className="mt-3">
        <Notice tone="info">{t("marketing.settings.policyNote")}</Notice>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button
          variant="primary"
          disabled={action.pending}
          onClick={() =>
            void action.run(async () => {
              await marketingApi.updateSettings({
                metricsRetentionMonths: form.metricsRetentionMonths,
                runLogRetentionDays: form.runLogRetentionDays,
                staleAfterHours: form.staleAfterHours,
              });
              setSaved(true);
              await queryClient.invalidateQueries({ queryKey: queryKeys.marketing });
            })
          }
        >
          {t("marketing.common.save")}
        </Button>
        {saved ? (
          <span className="text-sm text-emerald-700">{t("marketing.common.saved")}</span>
        ) : null}
      </div>
    </Card>
  );
}

export default function MarketingSettingsPage() {
  const t = useT();
  const { can } = useMarketingAccess();
  const { data, error, refetch } = useQuery({
    queryKey: [...queryKeys.marketing, "settings"],
    queryFn: () => marketingApi.getSettings(),
  });

  if (!can("marketing.manage")) {
    return <Notice tone="warning">{t("marketing.settings.manageOnly")}</Notice>;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <ErrorBanner message={t("marketing.common.loadFailed")} onRetry={() => void refetch()} />
      ) : null}
      {data ? <SettingsForm initial={data} /> : null}
      <Card title={t("marketing.settings.accessTitle")}>
        <p className="whitespace-pre-line text-sm text-gray-700">
          {t("marketing.settings.accessHelp")}
        </p>
      </Card>
    </div>
  );
}
