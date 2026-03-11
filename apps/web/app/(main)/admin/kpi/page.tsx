"use client";

import { useEffect, useState } from "react";
import { metricsApi, type KpiOverviewResponse } from "@/lib/api";

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const alertTone = (critical: boolean, warning: boolean) => {
  if (critical) return "border-red-200 bg-red-50 text-red-700";
  if (warning) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};
const alertLabel = (critical: boolean, warning: boolean) => {
  if (critical) return "Critical";
  if (warning) return "Warning";
  return "Normal";
};

export default function KpiDashboardPage() {
  const [data, setData] = useState<KpiOverviewResponse | null>(null);
  const [windowDays, setWindowDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        const message = e instanceof Error ? e.message : "Failed to load KPI";
        setError(message);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [windowDays]);

  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">KPI Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">
              MAU / Search / Meeting minutes / Auth and authorization security signals
            </p>
          </div>
          <label className="text-sm text-gray-600">
            Window
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className="ml-2 rounded border border-gray-300 px-2 py-1"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
        </div>

        {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {isLoading ? (
          <div className="rounded border border-gray-200 bg-white p-8 text-center text-gray-500">Loading KPI...</div>
        ) : data ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded border border-gray-200 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-gray-500">MAU</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{data.metrics.mau}</p>
              <p className="mt-1 text-xs text-gray-500">Distinct authenticated users</p>
            </div>
            <div className="rounded border border-gray-200 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-gray-500">Search Success</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{percent(data.metrics.searchSuccessRate)}</p>
              <p className="mt-1 text-xs text-gray-500">
                {data.metrics.searchSuccess} / {data.metrics.searchTotal} searches
              </p>
            </div>
            <div className="rounded border border-gray-200 bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-gray-500">Minutes Utilization</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{percent(data.metrics.minutesUtilizationRate)}</p>
              <p className="mt-1 text-xs text-gray-500">
                {data.metrics.meetingsWithMinutes} / {data.metrics.meetingsTotal} meetings
              </p>
            </div>
            <div className="rounded border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Auth Rejected</p>
                <span
                  className={`rounded border px-2 py-1 text-[11px] font-medium ${alertTone(
                    data.alerts.authRejected.critical,
                    data.alerts.authRejected.warning
                  )}`}
                >
                  {alertLabel(data.alerts.authRejected.critical, data.alerts.authRejected.warning)}
                </span>
              </div>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{data.security.authRejectedTotal}</p>
              <p className="mt-1 text-xs text-gray-500">
                Warning {data.alerts.authRejected.warningThreshold} / Critical {data.alerts.authRejected.criticalThreshold}
              </p>
            </div>
            <div className="rounded border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">AuthZ Denied</p>
                <span
                  className={`rounded border px-2 py-1 text-[11px] font-medium ${alertTone(
                    data.alerts.authzDenied.critical,
                    data.alerts.authzDenied.warning
                  )}`}
                >
                  {alertLabel(data.alerts.authzDenied.critical, data.alerts.authzDenied.warning)}
                </span>
              </div>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{data.security.authzDeniedTotal}</p>
              <p className="mt-1 text-xs text-gray-500">
                Warning {data.alerts.authzDenied.warningThreshold} / Critical {data.alerts.authzDenied.criticalThreshold}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
