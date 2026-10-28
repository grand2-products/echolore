"use client";

import type { MarketingConnectorTestResponse } from "@echolore/shared/contracts";
import { useState } from "react";
import { ErrorBanner } from "@/components/ui";
import { marketingApi } from "@/lib/api";
import { useT } from "@/lib/i18n";
import {
  buildSetupRequest,
  emptySetupFields,
  type SetupFields,
  type SetupSource,
} from "./connector-setup";
import { Button, Field, inputClass, Modal, Notice, useAction } from "./ui";

const SOURCES: SetupSource[] = ["ga4", "meta_ads", "google_ads"];

export function ConnectorSetupDialog({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => void;
}) {
  const t = useT();
  const action = useAction();
  const [source, setSource] = useState<SetupSource>("ga4");
  const [fields, setFields] = useState<SetupFields>(emptySetupFields);
  const [issue, setIssue] = useState<string | null>(null);
  const [result, setResult] = useState<MarketingConnectorTestResponse | null>(null);
  const set = (patch: Partial<SetupFields>) => setFields((current) => ({ ...current, ...patch }));

  const connect = () => {
    setIssue(null);
    setResult(null);
    const built = buildSetupRequest(source, fields);
    if (!built.ok) {
      setIssue(t(`marketing.connectors.setup.issues.${built.issue}`));
      return;
    }
    void action.run(async () => {
      const created = await marketingApi.createConnector(built.body);
      try {
        const tested = await marketingApi.testConnector(created.id);
        if (!tested.ok) {
          await marketingApi.deleteConnector(created.id);
          setResult(tested);
          return;
        }
        setResult(tested);
        onConnected();
      } catch (err) {
        await marketingApi.deleteConnector(created.id).catch(() => undefined);
        throw err;
      }
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("marketing.connectors.setup.title")}
      footer={
        result?.ok ? (
          <Button variant="primary" onClick={onClose}>
            {t("marketing.common.close")}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={action.pending}>
              {t("marketing.common.cancel")}
            </Button>
            <Button variant="primary" onClick={connect} disabled={action.pending}>
              {t("marketing.connectors.setup.connect")}
            </Button>
          </>
        )
      }
    >
      <div className="grid gap-3">
        {action.error ? <ErrorBanner message={action.error} /> : null}
        {issue ? <ErrorBanner message={issue} /> : null}
        {result ? <Notice tone={result.ok ? "success" : "danger"}>{result.message}</Notice> : null}
        {result?.ok ? null : (
          <>
            <div className="flex flex-wrap gap-1">
              {SOURCES.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={item === source ? "primary" : "secondary"}
                  onClick={() => {
                    setSource(item);
                    setIssue(null);
                    setResult(null);
                  }}
                >
                  {t(`marketing.sources.${item}`)}
                </Button>
              ))}
            </div>
            {source === "ga4" ? (
              <>
                <Field
                  label={t("marketing.connectors.setup.propertyId")}
                  hint={t("marketing.connectors.setup.propertyIdHint")}
                  required
                >
                  <input
                    className={inputClass}
                    value={fields.propertyId}
                    placeholder="123456789"
                    autoComplete="off"
                    onChange={(e) => set({ propertyId: e.target.value })}
                  />
                </Field>
                <Field
                  label={t("marketing.connectors.setup.serviceAccount")}
                  hint={t("marketing.connectors.setup.serviceAccountHint")}
                  required
                >
                  <textarea
                    className={`${inputClass} min-h-28 font-mono text-xs`}
                    value={fields.serviceAccountKeyJson}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => set({ serviceAccountKeyJson: e.target.value })}
                  />
                </Field>
              </>
            ) : null}
            {source === "meta_ads" ? (
              <>
                <Field
                  label={t("marketing.connectors.setup.adAccountId")}
                  hint={t("marketing.connectors.setup.adAccountHint")}
                  required
                >
                  <input
                    className={inputClass}
                    value={fields.adAccountId}
                    placeholder="act_1234567890"
                    autoComplete="off"
                    onChange={(e) => set({ adAccountId: e.target.value })}
                  />
                </Field>
                <Field
                  label={t("marketing.connectors.setup.accessToken")}
                  hint={t("marketing.connectors.setup.accessTokenHint")}
                  required
                >
                  <textarea
                    className={`${inputClass} min-h-20 font-mono text-xs`}
                    value={fields.accessToken}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => set({ accessToken: e.target.value })}
                  />
                </Field>
              </>
            ) : null}
            {source === "google_ads" ? (
              <>
                <Field
                  label={t("marketing.connectors.setup.customerId")}
                  hint={t("marketing.connectors.setup.customerIdHint")}
                  required
                >
                  <input
                    className={inputClass}
                    value={fields.customerId}
                    placeholder="123-456-7890"
                    autoComplete="off"
                    onChange={(e) => set({ customerId: e.target.value })}
                  />
                </Field>
                <Field label={t("marketing.connectors.setup.clientId")} required>
                  <input
                    className={inputClass}
                    value={fields.clientId}
                    autoComplete="off"
                    onChange={(e) => set({ clientId: e.target.value })}
                  />
                </Field>
                <Field label={t("marketing.connectors.setup.developerToken")} required>
                  <input
                    className={inputClass}
                    value={fields.developerToken}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => set({ developerToken: e.target.value })}
                  />
                </Field>
                <Field label={t("marketing.connectors.setup.clientSecret")} required>
                  <input
                    className={inputClass}
                    value={fields.clientSecret}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => set({ clientSecret: e.target.value })}
                  />
                </Field>
                <Field
                  label={t("marketing.connectors.setup.refreshToken")}
                  hint={t("marketing.connectors.setup.googleSecretHint")}
                  required
                >
                  <textarea
                    className={`${inputClass} min-h-16 font-mono text-xs`}
                    value={fields.refreshToken}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => set({ refreshToken: e.target.value })}
                  />
                </Field>
              </>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
