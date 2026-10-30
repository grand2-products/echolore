"use client";

import type { AgentTokenDto, AgentTokenUsageDto } from "@echolore/shared/contracts";
import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useAsyncData } from "@/lib/hooks/use-async-data";
import { useFormatters, useT } from "@/lib/i18n";

/**
 * Admin UI for MCP agent tokens: issue (with optional expiry), list, revoke,
 * and inspect recent tool-call usage of bearer tokens that external AI agents
 * (ChatGPT / Claude / etc.) use to connect to /mcp.
 * The plaintext secret is shown exactly once at creation time.
 */

const EXPIRY_OPTIONS = [null, 7, 30, 90] as const;

function isExpired(token: AgentTokenDto): boolean {
  if (!token.expiresAt) return false;
  return new Date(token.expiresAt).getTime() <= Date.now();
}

export function AgentTokensSection() {
  const t = useT();
  const formatters = useFormatters();
  const getApiErrorMessage = useApiErrorMessage();

  const {
    data: tokens,
    isLoading,
    error,
    refetch: loadTokens,
  } = useAsyncData<AgentTokenDto[]>([], async () => {
    const response = await adminApi.listAgentTokens();
    return response.tokens;
  });

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [usageForId, setUsageForId] = useState<string | null>(null);
  const [usage, setUsage] = useState<AgentTokenUsageDto[] | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  const displayError = error ?? createError;

  const toggleScope = (scope: string) => {
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]
    );
  };

  const expiryLabel = (days: number | null) => {
    if (days === null) return t("admin.agentTokens.expiryNever");
    if (days === 7) return t("admin.agentTokens.expiry7d");
    if (days === 30) return t("admin.agentTokens.expiry30d");
    return t("admin.agentTokens.expiry90d");
  };

  const create = async () => {
    setIsCreating(true);
    setCreateError(null);
    setCopied(false);
    try {
      const response = await adminApi.createAgentToken({
        name: name.trim(),
        scopes: scopes as AgentTokenDto["scopes"],
        expiresInDays,
      });
      setIssuedSecret(response.secret);
      setName("");
      setScopes(["read"]);
      setExpiresInDays(null);
      await loadTokens();
    } catch (err) {
      setCreateError(getApiErrorMessage(err, t("admin.agentTokens.createError")));
    } finally {
      setIsCreating(false);
    }
  };

  const revoke = async (id: string) => {
    setRevokingId(id);
    try {
      await adminApi.revokeAgentToken(id);
      if (usageForId === id) {
        setUsageForId(null);
        setUsage(null);
      }
      await loadTokens();
    } catch (err) {
      setCreateError(getApiErrorMessage(err, t("admin.agentTokens.revokeError")));
    } finally {
      setRevokingId(null);
    }
  };

  const toggleUsage = async (id: string) => {
    if (usageForId === id) {
      setUsageForId(null);
      setUsage(null);
      setUsageError(null);
      return;
    }
    setUsageForId(id);
    setUsage(null);
    setUsageError(null);
    try {
      const response = await adminApi.listAgentTokenUsage(id);
      setUsage(response.usage);
    } catch (err) {
      setUsageError(getApiErrorMessage(err, t("admin.agentTokens.usageError")));
    }
  };

  const copySecret = async () => {
    if (!issuedSecret) return;
    try {
      await navigator.clipboard.writeText(issuedSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — user can still select the text manually
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.agentTokens.title")}</h2>
      <p className="mb-4 text-sm text-gray-600">{t("admin.agentTokens.description")}</p>

      {displayError ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{displayError}</span>
          <button
            type="button"
            onClick={() => void loadTokens()}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            {t("common.actions.retry")}
          </button>
        </div>
      ) : null}

      {issuedSecret ? (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-medium text-amber-800">
            {t("admin.agentTokens.secretNotice")}
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-3 py-2 font-mono text-xs text-gray-800">
              {issuedSecret}
            </code>
            <button
              type="button"
              onClick={() => void copySecret()}
              className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              {copied ? t("admin.agentTokens.copied") : t("admin.agentTokens.copy")}
            </button>
            <button
              type="button"
              onClick={() => setIssuedSecret(null)}
              className="shrink-0 rounded-md px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100"
            >
              {t("common.actions.close")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            {t("admin.agentTokens.name")}
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("admin.agentTokens.namePlaceholder")}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap gap-4 text-sm text-gray-700">
            {(["read", "write", "reporting"] as const).map((scope) => (
              <label key={scope} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                  className="h-4 w-4"
                />
                {scope === "read"
                  ? t("admin.agentTokens.read")
                  : scope === "write"
                    ? t("admin.agentTokens.write")
                    : t("admin.agentTokens.reporting")}
              </label>
            ))}
          </div>
          <label className="block text-sm font-medium text-gray-700">
            {t("admin.agentTokens.expiresIn")}
            <select
              value={expiresInDays === null ? "never" : String(expiresInDays)}
              onChange={(event) =>
                setExpiresInDays(event.target.value === "never" ? null : Number(event.target.value))
              }
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 sm:w-48"
            >
              {EXPIRY_OPTIONS.map((days) => (
                <option key={days === null ? "never" : days} value={days === null ? "never" : days}>
                  {expiryLabel(days)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => void create()}
          disabled={isCreating || !name.trim() || scopes.length === 0}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {isCreating ? t("common.status.loading") : t("admin.agentTokens.create")}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">{t("admin.agentTokens.loading")}</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-gray-500">{t("admin.agentTokens.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th className="px-2 py-2">{t("admin.agentTokens.name")}</th>
                <th className="px-2 py-2">{t("admin.agentTokens.scopes")}</th>
                <th className="px-2 py-2">{t("admin.agentTokens.createdAt")}</th>
                <th className="px-2 py-2">{t("admin.agentTokens.expiresAt")}</th>
                <th className="px-2 py-2">{t("admin.agentTokens.lastUsedAt")}</th>
                <th className="px-2 py-2">{t("admin.agentTokens.status")}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <>
                  <tr key={token.id} className="border-b border-gray-100">
                    <td className="px-2 py-2 font-medium text-gray-900">{token.name}</td>
                    <td className="px-2 py-2 text-gray-600">{token.scopes.join(", ")}</td>
                    <td className="px-2 py-2 text-gray-600">
                      {formatters.dateTime(token.createdAt)}
                    </td>
                    <td className="px-2 py-2 text-gray-600">
                      {token.expiresAt ? formatters.dateTime(token.expiresAt) : "—"}
                    </td>
                    <td className="px-2 py-2 text-gray-600">
                      {token.lastUsedAt ? formatters.dateTime(token.lastUsedAt) : "—"}
                    </td>
                    <td className="px-2 py-2">
                      {token.revokedAt ? (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {t("admin.agentTokens.revoked")}
                        </span>
                      ) : isExpired(token) ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          {t("admin.agentTokens.expired")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          {t("admin.agentTokens.active")}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleUsage(token.id)}
                          className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          {usageForId === token.id
                            ? t("common.actions.close")
                            : t("admin.agentTokens.usage")}
                        </button>
                        {!token.revokedAt ? (
                          <button
                            type="button"
                            onClick={() => void revoke(token.id)}
                            disabled={revokingId === token.id}
                            className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            {revokingId === token.id
                              ? t("common.status.loading")
                              : t("admin.agentTokens.revoke")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {usageForId === token.id ? (
                    <tr key={`${token.id}-usage`} className="border-b border-gray-100 bg-gray-50">
                      <td colSpan={7} className="px-3 py-3">
                        {usageError ? (
                          <p className="text-sm text-red-600">{usageError}</p>
                        ) : usage === null ? (
                          <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
                        ) : usage.length === 0 ? (
                          <p className="text-sm text-gray-500">
                            {t("admin.agentTokens.usageEmpty")}
                          </p>
                        ) : (
                          <ul className="space-y-1 text-xs text-gray-700">
                            {usage.map((entry) => (
                              <li key={entry.id} className="flex flex-wrap gap-2">
                                <span className="w-40 text-gray-500">
                                  {formatters.dateTime(entry.createdAt)}
                                </span>
                                <span
                                  className={
                                    entry.ok
                                      ? "font-medium text-emerald-700"
                                      : "font-medium text-red-600"
                                  }
                                >
                                  {entry.ok ? "OK" : "ERROR"}
                                </span>
                                <span className="font-mono">{entry.tool}</span>
                                {entry.client ? (
                                  <span className="text-gray-500">({entry.client})</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
