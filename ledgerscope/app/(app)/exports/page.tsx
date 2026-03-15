"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { type HeaderAction } from "@/components/layout/top-header";
import { useToast } from "@/components/providers/toast-provider";
import { DataSurface, EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import { WidgetCard } from "@/components/ui/widget-card";
import { useApiData } from "@/lib/hooks/use-api-data";
import { appApi } from "@/lib/services/app-api-client";
import { formatCurrencyAmount } from "@/lib/utils/format";
import type { ExportCreatePayload, ExportCreateResponse, ExportRunItem } from "@/types/contracts";

export default function ExportsPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { data, loading, error, reload } = useApiData(appApi.getExports);
  const [payload, setPayload] = useState<ExportCreatePayload>({
    format: "csv",
    mode: "summary_and_itemized",
    scope: "all",
  });
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadLoadingId, setDownloadLoadingId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [result, setResult] = useState<ExportCreateResponse | null>(null);

  const safeRecentRuns = useMemo(() => (Array.isArray(data?.recentRuns) ? data.recentRuns : []), [data?.recentRuns]);

  async function createExport() {
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const created = await appApi.createExport(payload);
      setResult(created);
      await reload();
      setCreateSuccess("Export generated successfully.");
      pushToast({ title: "Export generated", message: "Your export is ready to download.", variant: "success" });
      setTimeout(() => setCreateSuccess(null), 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create export.";
      setCreateError(message);
      pushToast({ title: "Export failed", message, variant: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function refreshRuns() {
    setRefreshing(true);
    setCreateError(null);

    try {
      await reload();
      setCreateSuccess("Export runs refreshed.");
      pushToast({ message: "Export runs refreshed.", variant: "info" });
      setTimeout(() => setCreateSuccess(null), 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to refresh exports.";
      setCreateError(message);
      pushToast({ title: "Refresh failed", message, variant: "error" });
    } finally {
      setRefreshing(false);
    }
  }

  async function downloadRun(run: ExportRunItem) {
    if (!run.downloadUrl) {
      const message = "Download is not available for this run yet.";
      setCreateError(message);
      pushToast({ title: "Download unavailable", message, variant: "error" });
      return;
    }

    setDownloadLoadingId(run.id);
    setCreateError(null);

    try {
      const response = await fetch(run.downloadUrl, { cache: "no-store" });
      if (!response.ok) {
        let detail = "Failed to download export file.";
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) detail = body.error;
        } catch {
          // keep generic message
        }
        throw new Error(detail);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const fallbackName = `ledger-export-${run.id}.${run.format}`;
      const match = contentDisposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] ?? fallbackName;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setCreateSuccess("Download started.");
      pushToast({ message: "Download started.", variant: "success" });
      setTimeout(() => setCreateSuccess(null), 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to download export.";
      setCreateError(message);
      pushToast({ title: "Download failed", message, variant: "error" });
    } finally {
      setDownloadLoadingId(null);
    }
  }

  function handleHeaderAction(action: HeaderAction) {
    const label = action.label.toLowerCase();

    if (label.includes("refresh")) {
      void refreshRuns();
      return;
    }

    if (label.includes("export") || label.includes("generate")) {
      void createExport();
      return;
    }

    if (label.includes("transactions")) {
      router.push("/transactions");
      return;
    }

    const message = `Action '${action.label}' is not wired yet.`;
    setCreateError(message);
    pushToast({ title: "Action failed", message, variant: "error" });
  }

  const headerActions = (data?.actions ?? []).map((action) => ({
    ...action,
    disabled: creating || refreshing,
    loading: (creating && action.label.toLowerCase().includes("export")) || (refreshing && action.label.toLowerCase().includes("refresh")),
    loadingLabel: action.label.toLowerCase().includes("refresh") ? "Refreshing..." : "Generating...",
  }));

  if (loading) {
    return (
      <PageShell title="Exports" description="Loading exports...">
        <LoadingState label="Loading export history..." />
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell title="Exports" description="Unable to load exports.">
        <ErrorState message={error ?? "Failed to load exports."} onRetry={() => void reload()} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={data.title}
      description={data.description}
      selectedRange={data.selectedRange}
      actions={headerActions}
      onActionClick={handleHeaderAction}
    >
      <DataSurface>
        {creating || refreshing ? <LoadingState label={creating ? "Generating export..." : "Refreshing export runs..."} /> : null}
        {createError ? <ErrorState message={createError} /> : null}
        {createSuccess ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{createSuccess}</p> : null}

        <section className="grid gap-4 xl:grid-cols-2">
          <WidgetCard title="Create export" description="Choose format, scope, and mode for reconciled reporting.">
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <label className="block">
                <span className="text-slate-600">Format</span>
                <select
                  value={payload.format}
                  onChange={(e) => setPayload((prev) => ({ ...prev, format: e.target.value as ExportCreatePayload["format"] }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={creating || refreshing}
                >
                  <option value="csv">CSV</option>
                  <option value="xlsx">XLSX</option>
                  <option value="pdf">PDF Summary</option>
                </select>
              </label>
              <label className="block">
                <span className="text-slate-600">Scope</span>
                <select
                  value={payload.scope}
                  onChange={(e) => setPayload((prev) => ({ ...prev, scope: e.target.value as ExportCreatePayload["scope"] }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={creating || refreshing}
                >
                  <option value="all">All transactions</option>
                  <option value="personal_only">Personal only</option>
                  <option value="business_only">Business only</option>
                  <option value="trip_tagged">Tagged trips/vacations</option>
                </select>
              </label>
              <label className="block">
                <span className="text-slate-600">Mode</span>
                <select
                  value={payload.mode}
                  onChange={(e) => setPayload((prev) => ({ ...prev, mode: e.target.value as ExportCreatePayload["mode"] }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={creating || refreshing}
                >
                  <option value="summary_only">Summary only</option>
                  <option value="itemized_only">Itemized only</option>
                  <option value="summary_and_itemized">Summary and itemized</option>
                </select>
              </label>
              <label className="block">
                <span className="text-slate-600">Date from</span>
                <input
                  type="date"
                  value={payload.dateFrom ?? ""}
                  onChange={(e) => setPayload((prev) => ({ ...prev, dateFrom: e.target.value || undefined }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={creating || refreshing}
                />
              </label>
              <label className="block">
                <span className="text-slate-600">Date to</span>
                <input
                  type="date"
                  value={payload.dateTo ?? ""}
                  onChange={(e) => setPayload((prev) => ({ ...prev, dateTo: e.target.value || undefined }))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  disabled={creating || refreshing}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => void createExport()}
              disabled={creating || refreshing}
              className="mt-4 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-slate-800 disabled:opacity-60"
            >
              {creating ? "Generating..." : "Generate export"}
            </button>
          </WidgetCard>

          <WidgetCard title="Last export preview" description="Totals reconcile with itemized rows and rollups.">
            {!result ? (
              <p className="text-sm text-slate-500">Generate an export to preview summary and rollups.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p>Summary total: <strong>{formatCurrencyAmount(result.preview.summaryTotal)}</strong></p>
                <p>Itemized total: <strong>{formatCurrencyAmount(result.preview.itemizedTotal)}</strong></p>
                <p>Reconciled: <strong>{result.preview.reconciled ? "Yes" : "No"}</strong></p>
                <p>Rows: <strong>{result.preview.rowCount}</strong></p>
                <p>
                  Download: {result.run.downloadUrl ? (
                    <button type="button" className="text-sky-700 underline" onClick={() => void downloadRun(result.run)} disabled={downloadLoadingId === result.run.id}>
                      {downloadLoadingId === result.run.id ? "Downloading..." : "Open file"}
                    </button>
                  ) : "Not available"}
                </p>
              </div>
            )}
          </WidgetCard>
        </section>

        <section>
          <WidgetCard title="Recent export runs" description="Includes status, totals, and download links.">
            {safeRecentRuns.length === 0 ? (
              <EmptyState title="No export runs yet" detail="No exports created yet. Generate your first CSV, XLSX, or PDF export." />
            ) : (
              <div className="space-y-2">
                {safeRecentRuns.map((run) => (
                  <div key={run.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-800">
                          {run.format.toUpperCase()} | {run.scope.replaceAll("_", " ")} | {run.mode.replaceAll("_", " ")}
                        </p>
                        <p className="text-xs text-slate-500">
                          {run.createdAt} | status: {run.status}
                          {typeof run.rowCount === "number" ? ` | rows: ${run.rowCount}` : ""}
                          {typeof run.totalAmount === "number" ? ` | total: ${formatCurrencyAmount(run.totalAmount)}` : ""}
                        </p>
                        {run.errorMessage ? <p className="text-xs text-rose-600">{run.errorMessage}</p> : null}
                      </div>
                      {run.downloadUrl ? (
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
                          onClick={() => void downloadRun(run)}
                          disabled={downloadLoadingId === run.id}
                        >
                          {downloadLoadingId === run.id ? "Downloading..." : "Download"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </WidgetCard>
        </section>
      </DataSurface>
    </PageShell>
  );
}
