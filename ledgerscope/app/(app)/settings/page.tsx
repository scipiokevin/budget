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
import type {
  ImportKind,
  SpreadsheetImportMapping,
  StatementImportDraftPreview,
  StatementImportHistoryItem,
  StatementImportPreview,
} from "@/types/contracts";

type SettingsDraft = {
  emailAlerts: boolean;
  weeklyRecap: boolean;
  timezone: string;
};

const STORAGE_KEY = "ledgerscope.settings";
const FINANCIAL_RESET_CONFIRMATION = "RESET";
const DEFAULT_SETTINGS: SettingsDraft = {
  emailAlerts: true,
  weeklyRecap: true,
  timezone: "America/New_York",
};
const MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024;

const SPREADSHEET_FIELD_LABELS: Array<{
  key: keyof SpreadsheetImportMapping;
  label: string;
}> = [
  { key: "dateColumn", label: "Date column" },
  { key: "descriptionColumn", label: "Description column" },
  { key: "merchantColumn", label: "Merchant column" },
  { key: "amountColumn", label: "Amount column" },
  { key: "debitColumn", label: "Debit column" },
  { key: "creditColumn", label: "Credit column" },
  { key: "directionColumn", label: "Direction column" },
  { key: "accountColumn", label: "Account column" },
];

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

function looksLikePdfFile(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function looksLikeSpreadsheetFile(file: File) {
  return (
    /\.(xlsx|xls|csv)$/i.test(file.name)
    || [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
      "text/plain",
    ].includes(file.type)
  );
}

function importKindLabel(importKind: ImportKind) {
  return importKind === "spreadsheet" ? "Spreadsheet" : "Statement PDF";
}

function importSourceLabel(importKind: ImportKind) {
  return importKind === "spreadsheet" ? "spreadsheet_import" : "statement_pdf";
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
  const [pendingStatementFile, setPendingStatementFile] = useState<File | null>(null);
  const [statementDraftPreview, setStatementDraftPreview] = useState<StatementImportDraftPreview | null>(null);
  const [statementPreview, setStatementPreview] = useState<StatementImportPreview | null>(null);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [spreadsheetMappingDraft, setSpreadsheetMappingDraft] = useState<SpreadsheetImportMapping>({});
  const [showFinancialResetConfirmation, setShowFinancialResetConfirmation] = useState(false);
  const [financialResetConfirmation, setFinancialResetConfirmation] = useState("");
  const [financialResetLoading, setFinancialResetLoading] = useState(false);
  const [financialResetError, setFinancialResetError] = useState<string | null>(null);
  const [financialResetSuccess, setFinancialResetSuccess] = useState<string | null>(null);

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
      draft.emailAlerts !== saved.emailAlerts
      || draft.weeklyRecap !== saved.weeklyRecap
      || draft.timezone !== saved.timezone,
    [draft, saved],
  );

  const isSpreadsheetPreview = statementPreview?.importKind === "spreadsheet";
  const spreadsheetColumns = isSpreadsheetPreview ? (statementPreview?.spreadsheetColumns ?? []) : [];
  const draftSelectedEntryIds = useMemo(
    () => statementDraftPreview?.transactions.filter((item) => !item.duplicateTransactionId).map((item) => item.id) ?? [],
    [statementDraftPreview],
  );

  async function loadStatementHistory() {
    setStatementHistoryLoading(true);
    try {
      const response = await appApi.getStatementImportHistory();
      setStatementHistory(Array.isArray(response.items) ? response.items : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load import history.";
      setStatementUploadError(message);
    } finally {
      setStatementHistoryLoading(false);
    }
  }

  function applyPreviewState(preview: StatementImportPreview, successMessage?: string) {
    setStatementPreview(preview);
    setSelectedEntryIds(preview.transactions.filter((item) => !item.duplicateTransactionId).map((item) => item.id));
    setSpreadsheetMappingDraft(preview.spreadsheetMapping ?? {});
    if (successMessage) setStatementUploadSuccess(successMessage);
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

  function handleStatementFileSelect(file: File | null) {
    if (!file) return;

    setStatementUploadError(null);
    setStatementUploadSuccess(null);

    if (!looksLikePdfFile(file)) {
      setStatementUploadError("Only PDF statements are supported.");
      return;
    }

    if (file.size > MAX_IMPORT_SIZE_BYTES) {
      setStatementUploadError("PDF file must be smaller than 10 MB.");
      return;
    }

    setPendingStatementFile(file);
    setStatementDraftPreview(null);
    setStatementPreview(null);
    setSelectedEntryIds([]);
    setSpreadsheetMappingDraft({});
  }

  async function handlePreviewStatementPdf() {
    if (!pendingStatementFile) return;

    setStatementUploadError(null);
    setStatementUploadSuccess(null);

    setStatementActionLoading(true);

    try {
      const response = await appApi.previewStatementPdf(pendingStatementFile);
      setStatementDraftPreview(response.preview);
      pushToast({
        title: "Preview ready",
        message: "Recognized statement data is ready to review before upload.",
        variant: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to preview the selected statement.";
      setStatementUploadError(message);
      pushToast({ title: "Preview failed", message, variant: "error" });
    } finally {
      setStatementActionLoading(false);
    }
  }

  async function handleStatementUpload() {
    if (!pendingStatementFile) return;

    setStatementUploadError(null);
    setStatementUploadSuccess(null);

    setStatementActionLoading(true);

    try {
      const response = await appApi.uploadStatementPdf(pendingStatementFile);
      applyPreviewState(response.importPreview, "Statement uploaded. Review extracted transactions before importing.");
      setStatementDraftPreview(null);
      setPendingStatementFile(null);
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

  async function handleSpreadsheetUpload(file: File | null) {
    if (!file) return;

    setStatementUploadError(null);
    setStatementUploadSuccess(null);

    if (!looksLikeSpreadsheetFile(file)) {
      setStatementUploadError("Only XLS, XLSX, and CSV files are supported for spreadsheet import.");
      return;
    }

    if (file.size > MAX_IMPORT_SIZE_BYTES) {
      setStatementUploadError("Spreadsheet file must be smaller than 10 MB.");
      return;
    }

    setStatementActionLoading(true);

    try {
      const response = await appApi.uploadSpreadsheetFile(file);
      applyPreviewState(response.importPreview, "Spreadsheet uploaded. Review column mapping and extracted transactions before importing.");
      pushToast({
        title: "Spreadsheet ready",
        message: "Review the column mapping and extracted transactions before importing them.",
        variant: "success",
      });
      await loadStatementHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to process the uploaded spreadsheet.";
      setStatementUploadError(message);
      pushToast({ title: "Upload failed", message, variant: "error" });
    } finally {
      setStatementActionLoading(false);
    }
  }

  async function handleSpreadsheetRemap() {
    if (!statementPreview || statementPreview.importKind !== "spreadsheet") return;

    setStatementActionLoading(true);
    setStatementUploadError(null);

    try {
      const response = await appApi.remapStatementImport(statementPreview.id, spreadsheetMappingDraft);
      applyPreviewState(response.importPreview, "Spreadsheet preview refreshed. Review the updated transactions before importing.");
      pushToast({
        title: "Preview updated",
        message: "Spreadsheet mapping was applied to the import preview.",
        variant: "success",
      });
      await loadStatementHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to refresh the spreadsheet preview.";
      setStatementUploadError(message);
      pushToast({ title: "Mapping failed", message, variant: "error" });
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
      applyPreviewState(response.importPreview);
      setStatementUploadSuccess(`${response.importedCount} transactions imported from the ${statementPreview.importKind === "spreadsheet" ? "spreadsheet" : "statement"}.`);
      pushToast({
        title: `${importKindLabel(statementPreview.importKind)} imported`,
        message: `${response.importedCount} transactions were added as ${importSourceLabel(statementPreview.importKind)} imports.`,
        variant: "success",
      });
      await loadStatementHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to import transactions.";
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
      setStatementUploadSuccess(`${importKindLabel(statementPreview.importKind)} import cancelled.`);
      setStatementPreview(null);
      setSelectedEntryIds([]);
      setPendingStatementFile(null);
      setStatementDraftPreview(null);
      setSpreadsheetMappingDraft({});
      pushToast({ title: "Import cancelled", message: "The import preview was cleared without importing transactions.", variant: "info" });
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

  async function handleFinancialReset() {
    setFinancialResetError(null);
    setFinancialResetSuccess(null);

    if (financialResetConfirmation !== FINANCIAL_RESET_CONFIRMATION) {
      setFinancialResetError("Type RESET exactly before clearing financial data.");
      return;
    }

    setFinancialResetLoading(true);

    try {
      const response = await appApi.resetFinancialData(financialResetConfirmation);
      setStatementPreview(null);
      setSelectedEntryIds([]);
      setPendingStatementFile(null);
      setStatementDraftPreview(null);
      setSpreadsheetMappingDraft({});
      setStatementHistory([]);
      setStatementUploadError(null);
      setStatementUploadSuccess(null);
      setShowFinancialResetConfirmation(false);
      setFinancialResetConfirmation("");
      await loadStatementHistory();

      const summary = response.summary;
      const message = `Removed ${summary.transactionsDeleted} transactions, ${summary.bankConnectionsDeleted} bank connections, ${summary.statementImportsDeleted} imports, and ${summary.budgetsDeleted} budgets.`;
      setFinancialResetSuccess(message);
      pushToast({
        title: "Financial data cleared",
        message,
        variant: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to clear financial data.";
      setFinancialResetError(message);
      pushToast({ title: "Reset failed", message, variant: "error" });
    } finally {
      setFinancialResetLoading(false);
    }
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
      description="Manage local preferences, recovery options, and import workflows."
      selectedRange="Preferences"
      actions={actions}
      onActionClick={(action) => void handleAction(action)}
    >
      <DataSurface>
        {error ? <ErrorState message={error} onDismiss={() => setError(null)} /> : null}
        {statementUploadError ? <ErrorState message={statementUploadError} onDismiss={() => setStatementUploadError(null)} /> : null}
        {financialResetError ? <ErrorState message={financialResetError} onDismiss={() => setFinancialResetError(null)} /> : null}
        {statementUploadSuccess ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{statementUploadSuccess}</p>
        ) : null}
        {financialResetSuccess ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{financialResetSuccess}</p>
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
          <div className="space-y-4">
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
                    accept="application/pdf,.pdf"
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                    onChange={(event) => handleStatementFileSelect(event.target.files?.[0] ?? null)}
                    disabled={statementActionLoading}
                  />
                </label>

                {pendingStatementFile ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="font-medium text-slate-900">{pendingStatementFile.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {(pendingStatementFile.size / 1024).toFixed(1)} KB • {pendingStatementFile.type || "application/pdf"}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handlePreviewStatementPdf()}
                    disabled={statementActionLoading || !pendingStatementFile}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {statementActionLoading && !statementPreview ? "Previewing..." : "Preview recognized data"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingStatementFile(null);
                      setStatementDraftPreview(null);
                      setStatementUploadError(null);
                    }}
                    disabled={statementActionLoading || !pendingStatementFile}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Clear file
                  </button>
                </div>

                <p className="text-xs text-slate-500">
                  PDF only. Maximum file size: 10 MB. Preview recognized data before saving the import to history.
                </p>
              </div>
            </WidgetCard>

            <WidgetCard
              title="Spreadsheet Upload"
              description="Upload exported bank data if you prefer structured imports over statement PDFs."
            >
              <div className="space-y-4 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
                  Upload an XLS, XLSX, or CSV file, map the columns, preview the extracted transactions, and import only the rows you approve.
                </div>

                <label className="block">
                  <span className="text-slate-600">Spreadsheet file</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                    onChange={(event) => void handleSpreadsheetUpload(event.target.files?.[0] ?? null)}
                    disabled={statementActionLoading}
                  />
                </label>

                <p className="text-xs text-slate-500">
                  Supported formats: XLS, XLSX, and CSV. Maximum file size: 10 MB. Spreadsheet imports are labeled separately in Transactions.
                </p>
              </div>
            </WidgetCard>
          </div>

          <WidgetCard title="Import history" description="Recent statement and spreadsheet uploads with their import outcomes.">
            {statementHistoryLoading ? (
              <LoadingState label="Loading import history..." />
            ) : statementHistory.length === 0 ? (
              <EmptyState
                title="No imports yet"
                detail="Upload a PDF statement or spreadsheet here if Plaid is unavailable or you prefer an offline import workflow."
              />
            ) : (
              <div className="space-y-2 text-sm">
                {statementHistory.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-slate-900">{item.filename}</p>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600">
                        {importKindLabel(item.importKind)}
                      </span>
                    </div>
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

        {statementDraftPreview ? (
          <section>
            <WidgetCard title="Preview recognized PDF data" description="Review what LedgerScope recognized before the statement is uploaded into import history.">
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Import type</p>
                    <p className="mt-1 font-medium text-slate-900">Statement PDF</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">File</p>
                    <p className="mt-1 font-medium text-slate-900">{statementDraftPreview.filename}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Account label</p>
                    <p className="mt-1 font-medium text-slate-900">{statementDraftPreview.accountLabel ?? "Not detected"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Parser confidence</p>
                    <p className="mt-1 font-medium text-slate-900">{Math.round(statementDraftPreview.parserConfidence * 100)}%</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Statement period</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {statementDraftPreview.statementPeriodStart && statementDraftPreview.statementPeriodEnd
                      ? `${new Date(statementDraftPreview.statementPeriodStart).toLocaleDateString()} - ${new Date(statementDraftPreview.statementPeriodEnd).toLocaleDateString()}`
                      : "Not detected"}
                  </p>
                </div>

                {statementDraftPreview.parserMessage ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                    {statementDraftPreview.parserMessage}
                  </div>
                ) : null}

                {statementDraftPreview.transactions.length === 0 ? (
                  <EmptyState
                    title="No transactions recognized yet"
                    detail="LedgerScope could not confidently detect transactions from this PDF preview. You can try a different statement before saving anything."
                  />
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="min-w-full bg-white text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Merchant</th>
                          <th className="px-4 py-3 font-medium">Description</th>
                          <th className="px-4 py-3 text-right font-medium">Amount</th>
                          <th className="px-4 py-3 font-medium">Direction</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statementDraftPreview.transactions.map((entry) => (
                          <tr key={entry.id} className="border-t border-slate-100">
                            <td className="px-4 py-3 text-xs text-slate-600">{entry.date ?? "Unknown"}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{entry.merchant ?? "Unknown merchant"}</td>
                            <td className="px-4 py-3 text-slate-600">{entry.description}</td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrencyAmount(entry.amount)}</td>
                            <td className="px-4 py-3 text-xs uppercase tracking-[0.08em] text-slate-500">{entry.direction ?? "unknown"}</td>
                            <td className="px-4 py-3">
                              {entry.duplicateTransactionId ? (
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleStatementUpload()}
                    disabled={statementActionLoading || !pendingStatementFile || draftSelectedEntryIds.length === 0}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {statementActionLoading ? "Uploading..." : "Use this preview for import"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatementDraftPreview(null);
                      setStatementUploadSuccess(null);
                    }}
                    disabled={statementActionLoading}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Close preview
                  </button>
                  <p className="text-xs text-slate-500">
                    Nothing is saved to import history until you continue with this preview.
                  </p>
                </div>
              </div>
            </WidgetCard>
          </section>
        ) : null}

        {statementPreview ? (
          <section>
            <WidgetCard
              title={statementPreview.importKind === "spreadsheet" ? "Review spreadsheet import" : "Review extracted transactions"}
              description={
                statementPreview.importKind === "spreadsheet"
                  ? "Confirm the column mapping and extracted rows before importing them into LedgerScope."
                  : "Confirm these statement transactions before importing them into LedgerScope."
              }
            >
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Import type</p>
                    <p className="mt-1 font-medium text-slate-900">{importKindLabel(statementPreview.importKind)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">File</p>
                    <p className="mt-1 font-medium text-slate-900">{statementPreview.filename}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Account label</p>
                    <p className="mt-1 font-medium text-slate-900">{statementPreview.accountLabel ?? "Not detected"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Parser confidence</p>
                    <p className="mt-1 font-medium text-slate-900">{Math.round(statementPreview.parserConfidence * 100)}%</p>
                  </div>
                </div>

                {statementPreview.importKind === "spreadsheet" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Source sheet</p>
                      <p className="mt-1 font-medium text-slate-900">{statementPreview.sourceSheet ?? "First sheet"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Detected rows</p>
                      <p className="mt-1 font-medium text-slate-900">{statementPreview.detectedTransactionCount}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Statement period</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {statementPreview.statementPeriodStart && statementPreview.statementPeriodEnd
                        ? `${new Date(statementPreview.statementPeriodStart).toLocaleDateString()} - ${new Date(statementPreview.statementPeriodEnd).toLocaleDateString()}`
                        : "Not detected"}
                    </p>
                  </div>
                )}

                {statementPreview.parserMessage ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                    {statementPreview.parserMessage}
                  </div>
                ) : null}

                {isSpreadsheetPreview && spreadsheetColumns.length > 0 ? (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Column mapping</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Adjust the spreadsheet columns below, then refresh the preview before importing.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {SPREADSHEET_FIELD_LABELS.map((field) => (
                        <label key={field.key} className="block">
                          <span className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{field.label}</span>
                          <select
                            value={spreadsheetMappingDraft[field.key] ?? ""}
                            onChange={(event) => setSpreadsheetMappingDraft((current) => ({
                              ...current,
                              [field.key]: event.target.value || undefined,
                            }))}
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                            disabled={statementActionLoading}
                          >
                            <option value="">Not mapped</option>
                            {spreadsheetColumns.map((column) => (
                              <option key={`${field.key}-${column}`} value={column}>
                                {column}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleSpreadsheetRemap()}
                        disabled={statementActionLoading}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {statementActionLoading ? "Refreshing preview..." : "Refresh preview"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSpreadsheetMappingDraft(statementPreview.spreadsheetMapping ?? {})}
                        disabled={statementActionLoading}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reset mapping
                      </button>
                    </div>
                  </div>
                ) : null}

                {statementPreview.transactions.length === 0 ? (
                  <EmptyState
                    title="No transactions extracted"
                    detail={
                      statementPreview.importKind === "spreadsheet"
                        ? "We could not confidently detect transactions from this spreadsheet. Adjust the column mapping and try again."
                        : "We could not confidently detect transactions from this PDF. Try a digitally generated statement if available."
                    }
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
                    Imported transactions are labeled as <span className="font-medium text-slate-700">{importSourceLabel(statementPreview.importKind)}</span> and duplicate candidates are skipped automatically.
                  </p>
                </div>
              </div>
            </WidgetCard>
          </section>
        ) : null}

        <section>
          <WidgetCard
            title="Reset financial data"
            description="Clear synced and imported financial data if incorrect transactions, budgets, or uploads were added."
          >
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">
                This removes financial records only. Your login, account profile, and local settings stay in place. Connected banks, transactions,
                budgets, exports, watchlist rules, statement imports, spreadsheet imports, and generated insights will be deleted.
              </div>

              {!showFinancialResetConfirmation ? (
                <button
                  type="button"
                  onClick={() => {
                    setFinancialResetError(null);
                    setFinancialResetSuccess(null);
                    setShowFinancialResetConfirmation(true);
                  }}
                  className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition-colors duration-150 hover:border-rose-400 hover:bg-rose-50"
                >
                  Reset financial data
                </button>
              ) : (
                <div className="space-y-3 rounded-xl border border-rose-200 bg-white px-4 py-4">
                  <p className="text-sm text-slate-700">
                    Type <span className="font-semibold text-rose-700">{FINANCIAL_RESET_CONFIRMATION}</span> to confirm permanent deletion.
                  </p>
                  <input
                    type="text"
                    value={financialResetConfirmation}
                    onChange={(event) => setFinancialResetConfirmation(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                    placeholder={FINANCIAL_RESET_CONFIRMATION}
                    disabled={financialResetLoading}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleFinancialReset()}
                      disabled={financialResetLoading || financialResetConfirmation !== FINANCIAL_RESET_CONFIRMATION}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {financialResetLoading ? "Clearing data..." : "Confirm reset"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowFinancialResetConfirmation(false);
                        setFinancialResetConfirmation("");
                        setFinancialResetError(null);
                      }}
                      disabled={financialResetLoading}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </WidgetCard>
        </section>
      </DataSurface>
    </PageShell>
  );
}
