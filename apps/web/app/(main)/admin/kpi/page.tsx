"use client";

import { ErrorBanner } from "@/components/ui";
import { type KpiOverviewResponse, metricsApi } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";
import { useEffect, useState } from "react";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const alertTone = (critical: boolean, warning: boolean) => {
  if (critical) return "border-red-200 bg-red-50 text-red-700";
  if (warning) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};
export default function KpiDashboardPage() {
  const t = useT();
  const { number } = useFormatters();
  const tt = (key: string, fallback: string, values?: Record<string, string | number>) => {
    const translated = t(key, values);
    return translated === key ? fallback : translated;
  };
  const [data, setData] = useState<KpiOverviewResponse | null>(null);
  const [windowDays, setWindowDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    void retryNonce; // re-trigger dependency
    let mounted = true;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await metricsApi.getOverview(windowDays);
        if (!mounted) return;
        setData(response);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load KPI");
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [windowDays, retryNonce]);

  const alertLabel = (critical: boolean, warning: boolean) => {
    if (critical) return tt("admin.kpi.critical", "Critical");
    if (warning) return tt("admin.kpi.warning", "Warning");
    return tt("admin.kpi.normal", "Normal");
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-end gap-4">
        <label className="text-sm text-gray-600">
          {tt("admin.kpi.window", "Window")}
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="ml-2 rounded border border-gray-300 px-2 py-1"
          >
            <option value={7}>{tt("admin.kpi.days", "7 days", { count: 7 })}</option>
            <option value={30}>{tt("admin.kpi.days", "30 days", { count: 30 })}</option>
            <option value={90}>{tt("admin.kpi.days", "90 days", { count: 90 })}</option>
          </select>
        </label>
      </div>

      {error ? (
        <ErrorBanner
          message={error}
          onRetry={() => setRetryNonce((current) => current + 1)}
          className="mb-4"
        />
      ) : null}

      {isLoading ? (
        <div className="rounded border border-gray-200 bg-white p-8 text-center text-gray-500">
          {tt("admin.kpi.loading", "Loading KPI...")}
        </div>
      ) : data ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded border border-gray-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {tt("admin.kpi.mauTitle", "MAU")}
            </p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{number(data.metrics.mau)}</p>
            <p className="mt-1 text-xs text-gray-500">
              {tt("admin.kpi.mauDescription", "Distinct authenticated users")}
            </p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {tt("admin.kpi.searchSuccessTitle", "Search Success")}
            </p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              {percent(data.metrics.searchSuccessRate)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {tt(
                "admin.kpi.searchSuccessDescription",
                `${number(data.metrics.searchSuccess)} / ${number(data.metrics.searchTotal)} searches`,
                {
                  success: number(data.metrics.searchSuccess),
                  total: number(data.metrics.searchTotal),
                }
              )}
            </p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {tt("admin.kpi.minutesTitle", "Minutes Utilization")}
            </p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              {percent(data.metrics.minutesUtilizationRate)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {tt(
                "admin.kpi.minutesDescription",
                `${number(data.metrics.meetingsWithMinutes)} / ${number(data.metrics.meetingsTotal)} meetings`,
                {
                  withMinutes: number(data.metrics.meetingsWithMinutes),
                  total: number(data.metrics.meetingsTotal),
                }
              )}
            </p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                {tt("admin.kpi.authRejectedTitle", "Auth Rejected")}
              </p>
              <span
                className={`rounded border px-2 py-1 text-[11px] font-medium ${alertTone(
                  data.alerts.authRejected.critical,
                  data.alerts.authRejected.warning
                )}`}
              >
                {alertLabel(data.alerts.authRejected.critical, data.alerts.authRejected.warning)}
              </span>
            </div>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              {number(data.security.authRejectedTotal)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {tt(
                "admin.kpi.thresholds",
                `Warning ${number(data.alerts.authRejected.warningThreshold)} / Critical ${number(data.alerts.authRejected.criticalThreshold)}`,
                {
                  warning: number(data.alerts.authRejected.warningThreshold),
                  critical: number(data.alerts.authRejected.criticalThreshold),
                }
              )}
            </p>
          </div>
          <div className="rounded border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                {tt("admin.kpi.authzDeniedTitle", "AuthZ Denied")}
              </p>
              <span
                className={`rounded border px-2 py-1 text-[11px] font-medium ${alertTone(
                  data.alerts.authzDenied.critical,
                  data.alerts.authzDenied.warning
                )}`}
              >
                {alertLabel(data.alerts.authzDenied.critical, data.alerts.authzDenied.warning)}
              </span>
            </div>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              {number(data.security.authzDeniedTotal)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {tt(
                "admin.kpi.thresholds",
                `Warning ${number(data.alerts.authzDenied.warningThreshold)} / Critical ${number(data.alerts.authzDenied.criticalThreshold)}`,
                {
                  warning: number(data.alerts.authzDenied.warningThreshold),
                  critical: number(data.alerts.authzDenied.criticalThreshold),
                }
              )}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
