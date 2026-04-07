"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { PageShell } from "@/components/layout/page-shell";
import { type HeaderAction } from "@/components/layout/top-header";
import { useToast } from "@/components/providers/toast-provider";
import { DataSurface, EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import { WidgetCard } from "@/components/ui/widget-card";
import { appApi } from "@/lib/services/app-api-client";
import { formatCurrencyAmount } from "@/lib/utils/format";
import type { StatementImportHistoryItem, StatementImportPreview } from "@/types/contracts";

type SettingsDraft = {
  emailAlerts: boolean;
  weeklyRecap: boolean;
  timezone: string;
};

const STORAGE_KEY = "ledgerscope.settings";
const DEFAULT_SETTINGS: SettingsDraft = {
  emailAlerts: true,
  weeklyRecap: true,
  timezone: "America/New_York",
};

function readStoredSettings(): SettingsDraft {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SettingsDraft>;
    return {
      emailAlerts: typeof parsed.emailAlerts === "boolean" ? parsed.emailAlerts : DEFAULT_SETTINGS.emailAlerts,
      weeklyRecap: typeof parsed.weeklyRecap === "boolean" ? parsed.weeklyRecap : DEFAULT_SETTINGS.weeklyRecap,
      timezone: typeof parsed.timezone === "string" && parsed.timezone ? parsed.timezone : DEFAULT_SETTINGS.timezone,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function SettingsPage() {
  const { pushToast } = useToast();
  const [draft, setDraft] = useState<SettingsDraft>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<SettingsDraft>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statementHistory, setStatementHistory] = useState<StatementImportHistoryItem[]>([]);
  const [statementHistoryLoading, setStatementHistoryLoading] = useState(true);
  const [statementActionLoading, setStatementActionLoading] = useState(false);
  const [statementUploadError, setStatementUploadError] = useState<string | null>(null);
  const [statementUploadSuccess, setStatementUploadSuccess] = useState<string | null>(null);
  const [statementPreview, setStatementPreview] = useState<StatementImportPreview | null>(null);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = readStoredSettings();
    setDraft(stored);
    setSaved(stored);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadStatementHistory();
  }, []);

  const isDirty = useMemo(
    () =>
      draft.emailAlerts !== saved.emailAlerts ||
      draft.weeklyRecap !== saved.weeklyRecap ||
      draft.timezone !== saved.timezone,
    [draft, saved],
  );

  async function loadStatementHistory() {
    setStatementHistoryLoading(true);
    try {
      const response = await appApi.getStatementImportHistory();
      setStatementHistory(Array.isArray(response.items) ? response.items : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load statement import history.";
      setStatementUploadError(message);
    } finally {
      setStatementHistoryLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      setSaved(draft);
      pushToast({ title: "Settings saved", message: "Your preferences were saved on this device.", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save settings.";
      setError(message);
      pushToast({ title: "Save failed", message, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setError(null);
    setDraft(DEFAULT_SETTINGS);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
      setSaved(DEFAULT_SETTINGS);
      pushToast({ title: "Settings reset", message: "Preferences were restored to defaults.", variant: "info" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reset settings.";
      setError(message);
      pushToast({ title: "Reset failed", message, variant: "error" });
    }
  }

  async function handleAction(action: HeaderAction) {
    const label = action.label.toLowerCase();
    if (label.includes("save")) {
      await handleSave();
      return;
    }

    if (label.includes("reset")) {
      handleReset();
      return;
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut({ callbackUrl: "/login" });
    } finally {
      setSigningOut(false);
    }
  }

  async function handleStatementUpload(file: File | null) {
    if (!file) return;

    setStatementUploadError(null);
    setStatementUploadSuccess(null);

    if (file.type !== "application/pdf") {
      setStatementUploadError("Only PDF statements are supported.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setStatementUploadError("PDF file must be smaller than 10 MB.");
      return;
    }

    setStatementActionLoading(true);

    try {
      const response = await appApi.uploadStatementPdf(file);
      setStatementPreview(response.importPreview);
      setSelectedEntryIds(response.importPreview.transactions.filter((item) => !item.duplicateTransactionId).map((item) => item.id));
      setStatementUploadSuccess("Statement uploaded. Review extracted transactions before importing.");
      pushToast({ title: "Statement ready", message: "Review extracted transactions before importing them.", variant: "success" });
      await loadStatementHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to process the uploaded statement.";
      setStatementUploadError(message);
      pushToast({ title: "Upload failed", message, variant: "error" });
    } finally {
      setStatementActionLoading(false);
    }
  }

  async function handleConfirmImport() {
    if (!statementPreview) return;
    setStatementActionLoading(true);
    setStatementUploadError(null);

    try {
      const response = await appApi.finalizeStatementImport(statementPreview.id, selectedEntryIds);
      setStatementPreview(response.importPreview);
      setStatementUploadSuccess(`${response.importedCount} transactions imported from the statement.`);
      pushToast({
        title: "Statement imported",
        message: `${response.importedCount} transactions were added as statement_pdf imports.`,
        variant: "success",
      });
      await loadStatementHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to import statement transactions.";
      setStatementUploadError(message);
      pushToast({ title: "Import failed", message, variant: "error" });
    } finally {
      setStatementActionLoading(false);
    }
  }

  async function handleCancelImport() {
    if (!statementPreview) return;
    setStatementActionLoading(true);
    setStatementUploadError(null);

    try {
      await appApi.cancelStatementImport(statementPreview.id);
      setStatementUploadSuccess("Statement import cancelled.");
      setStatementPreview(null);
      setSelectedEntryIds([]);
      pushToast({ title: "Import cancelled", message: "The statement preview was cleared without importing transactions.", variant: "info" });
      await loadStatementHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to cancel this import.";
      setStatementUploadError(message);
      pushToast({ title: "Cancel failed", message, variant: "error" });
    } finally {
      setStatementActionLoading(false);
    }
  }

  function toggleEntrySelection(entryId: string) {
    setSelectedEntryIds((current) => (current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId]));
  }

  const actions: HeaderAction[] = [
    {
      label: "Save Changes",
      variant: "primary",
      disabled: loading || saving || !isDirty,
      loading: saving,
      loadingLabel: "Saving...",
    },
    {
      label: "Reset",
      variant: "secondary",
      disabled: loading || saving || !isDirty,
    },
  ];

  return (
    <PageShell
      title="Settings"
      description="Manage local preferences and account actions."
      selectedRange="Preferences"
      actions={actions}
      onActionClick={(action) => void handleAction(action)}
    >
      <DataSurface>
        {error ? <ErrorState message={error} onDismiss={() => setError(null)} /> : null}
        {statementUploadError ? <ErrorState message={statementUploadError} onDismiss={() => setStatementUploadError(null)} /> : null}
        {statementUploadSuccess ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{statementUploadSuccess}</p>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-2">
          <WidgetCard title="Notifications" description="These preferences are saved locally on this device.">
            <div className="space-y-3 text-sm">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <span>
                  <span className="block font-medium text-slate-900">Email alerts</span>
                  <span className="text-slate-500">Receive important account and budget notifications.</span>
                </span>
                <input
                  type="checkbox"
                  checked={draft.emailAlerts}
                  onChange={(event) => setDraft((current) => ({ ...current, emailAlerts: event.target.checked }))}
                  disabled={loading || saving}
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <span>
                  <span className="block font-medium text-slate-900">Weekly recap</span>
                  <span className="text-slate-500">Get a weekly summary of spending, budgets, and insights.</span>
                </span>
                <input
                  type="checkbox"
                  checked={draft.weeklyRecap}
                  onChange={(event) => setDraft((current) => ({ ...current, weeklyRecap: event.target.checked }))}
                  disabled={loading || saving}
                />
              </label>
            </div>
          </WidgetCard>

          <WidgetCard title="Profile & session" description="Set display preferences and manage your session.">
            <div className="space-y-4 text-sm">
              <label className="block">
                <span className="text-slate-600">Timezone</span>
                <select
                  value={draft.timezone}
                  onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  disabled={loading || saving}
                >
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Chicago">America/Chicago</option>
                  <option value="America/Denver">America/Denver</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                  <option value="UTC">UTC</option>
                </select>
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
                Current save target: <span className="font-medium text-slate-900">This browser</span>
              </div>

              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </WidgetCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <WidgetCard
            title="Bank Statement Upload"
            description="Use this if Plaid is unavailable or if you prefer not to connect your bank account directly."
          >
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
                Upload a PDF bank or credit card statement to extract transactions, review them, and import only what you approve.
              </div>

              <label className="block">
                <span className="text-slate-600">Statement PDF</span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  onChange={(event) => void handleStatementUpload(event.target.files?.[0] ?? null)}
                  disabled={statementActionLoading}
                />
              </label>

              <p className="text-xs text-slate-500">
                PDF only. Maximum file size: 10 MB. Statement imports are labeled separately from Plaid activity.
              </p>
            </div>
          </WidgetCard>

          <WidgetCard title="Import history" description="Recent statement uploads and import outcomes.">
            {statementHistoryLoading ? (
              <LoadingState label="Loading statement import history..." />
            ) : statementHistory.length === 0 ? (
              <EmptyState
                title="No statement imports yet"
                detail="Upload a PDF statement here if Plaid is unavailable or you prefer an offline import workflow."
              />
            ) : (
              <div className="space-y-2 text-sm">
                {statementHistory.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 px-3 py-3">
                    <p className="font-medium text-slate-900">{item.filename}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Uploaded {new Date(item.uploadedAt).toLocaleString()} | {item.statementPeriodLabel}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {item.accountLabel ? `${item.accountLabel} | ` : ""}
                      Imported transactions: {item.importedTransactionCount} | Status: {item.parserStatus.replaceAll("_", " ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </WidgetCard>
        </section>

        {statementPreview ? (
          <section>
            <WidgetCard title="Review extracted transactions" description="Confirm these statement transactions before importing them into LedgerScope.">
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">File</p>
                    <p className="mt-1 font-medium text-slate-900">{statementPreview.filename}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Account label</p>
                    <p className="mt-1 font-medium text-slate-900">{statementPreview.accountLabel ?? "Not detected"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Statement period</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {statementPreview.statementPeriodStart && statementPreview.statementPeriodEnd
                        ? `${new Date(statementPreview.statementPeriodStart).toLocaleDateString()} - ${new Date(statementPreview.statementPeriodEnd).toLocaleDateString()}`
                        : "Not detected"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Parser confidence</p>
                    <p className="mt-1 font-medium text-slate-900">{Math.round(statementPreview.parserConfidence * 100)}%</p>
                  </div>
                </div>

                {statementPreview.parserMessage ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                    {statementPreview.parserMessage}
                  </div>
                ) : null}

                {statementPreview.transactions.length === 0 ? (
                  <EmptyState
                    title="No transactions extracted"
                    detail="We could not confidently detect transactions from this PDF. Try a digitally generated statement if available."
                  />
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="min-w-full bg-white text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-3 font-medium">Import</th>
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Merchant</th>
                          <th className="px-4 py-3 font-medium">Description</th>
                          <th className="px-4 py-3 text-right font-medium">Amount</th>
                          <th className="px-4 py-3 font-medium">Direction</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statementPreview.transactions.map((entry) => {
                          const isDuplicate = Boolean(entry.duplicateTransactionId);
                          const selected = selectedEntryIds.includes(entry.id);
                          return (
                            <tr key={entry.id} className="border-t border-slate-100">
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleEntrySelection(entry.id)}
                                  disabled={statementActionLoading || isDuplicate}
                                />
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600">{entry.date ?? "Unknown"}</td>
                              <td className="px-4 py-3 font-medium text-slate-900">{entry.merchant ?? "Unknown merchant"}</td>
                              <td className="px-4 py-3 text-slate-600">{entry.description}</td>
                              <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrencyAmount(entry.amount)}</td>
                              <td className="px-4 py-3 text-xs uppercase tracking-[0.08em] text-slate-500">{entry.direction ?? "unknown"}</td>
                              <td className="px-4 py-3">
                                {isDuplicate ? (
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                    Possible duplicate
                                  </span>
                                ) : (
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                    {Math.round(entry.confidence * 100)}% confidence
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleConfirmImport()}
                    disabled={statementActionLoading || selectedEntryIds.length === 0}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {statementActionLoading ? "Importing..." : "Confirm import"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCancelImport()}
                    disabled={statementActionLoading}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel import
                  </button>
                  <p className="text-xs text-slate-500">
                    Imported transactions are labeled as <span className="font-medium text-slate-700">statement_pdf</span> and duplicate candidates are skipped automatically.
                  </p>
                </div>
              </div>
            </WidgetCard>
          </section>
        ) : null}
      </DataSurface>
    </PageShell>
  );
}
