"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { type HeaderAction } from "@/components/layout/top-header";
import { BudgetAlertsSection } from "@/components/budgets/budget-alerts-section";
import { BudgetCategoryCard } from "@/components/budgets/budget-category-card";
import { BudgetForecastSection } from "@/components/budgets/budget-forecast-section";
import { BudgetFormModal } from "@/components/budgets/budget-form-modal";
import { BudgetSummaryHeader } from "@/components/budgets/budget-summary-header";
import { useToast } from "@/components/providers/toast-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import { appApi } from "@/lib/services/app-api-client";
import type { BudgetCategorySnapshot, BudgetUpsertPayload, BudgetsData, ForecastOverviewData } from "@/types/contracts";

const EMPTY_SUMMARY: BudgetsData["summary"] = {
  monthLabel: "Current month",
  totalBudget: 0,
  totalActual: 0,
  totalPending: 0,
  totalRemaining: 0,
  totalProjected: 0,
  topRiskCategory: "None",
};

export default function BudgetsPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const [data, setData] = useState<BudgetsData | null>(null);
  const [forecast, setForecast] = useState<ForecastOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetCategorySnapshot | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BudgetCategorySnapshot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [budgets, forecastOverview] = await Promise.all([appApi.getBudgets(), appApi.getForecastOverview()]);
      setData(budgets);
      setForecast(forecastOverview);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load budgets.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(payload: BudgetUpsertPayload) {
    setSaveLoading(true);
    setSaveError(null);

    try {
      if (payload.id) {
        await appApi.updateBudget(payload);
        pushToast({ message: "Budget updated.", variant: "success" });
      } else {
        await appApi.createBudget(payload);
        pushToast({ message: "Budget created.", variant: "success" });
      }

      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save budget.";
      setSaveError(message);
      pushToast({ title: "Save failed", message, variant: "error" });
    } finally {
      setSaveLoading(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;

    setDeleteLoadingId(pendingDelete.id);
    setSaveError(null);

    try {
      await appApi.deleteBudget(pendingDelete.id);
      pushToast({ message: `Deleted budget '${pendingDelete.category}'.`, variant: "success" });
      await load();
      setPendingDelete(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete budget.";
      setSaveError(message);
      pushToast({ title: "Delete failed", message, variant: "error" });
    } finally {
      setDeleteLoadingId(null);
    }
  }

  function handleHeaderAction(action: HeaderAction) {
    const label = action.label.toLowerCase();
    setSaveError(null);

    if (label.includes("create")) {
      setEditing(null);
      setFormOpen(true);
      return;
    }

    if (label.includes("export")) {
      router.push("/exports");
      return;
    }

    const message = `Action '${action.label}' is not wired yet.`;
    setSaveError(message);
    pushToast({ title: "Action failed", message, variant: "error" });
  }

  const safeActions = useMemo(
    () =>
      (Array.isArray(data?.actions) ? data.actions : []).map((action) => ({
        ...action,
        disabled: saveLoading || Boolean(deleteLoadingId),
        loading: action.label.toLowerCase().includes("create") && saveLoading,
        loadingLabel: "Saving...",
      })),
    [data?.actions, saveLoading, deleteLoadingId],
  );
  const safeCategories = useMemo(() => (Array.isArray(data?.categories) ? data.categories : []), [data?.categories]);
  const safeAlerts = useMemo(() => (Array.isArray(data?.recentAlerts) ? data.recentAlerts : []), [data?.recentAlerts]);

  if (loading) {
    return (
      <PageShell title="Budgets" description="Loading budgets...">
        <LoadingState label="Loading budgets and forecasts..." />
      </PageShell>
    );
  }

  if (error || !data || !forecast) {
    return (
      <PageShell title="Budgets" description="Unable to load budgets right now.">
        <ErrorState message={error ?? "Request failed."} onRetry={() => void load()} />
      </PageShell>
    );
  }

  return (
    <>
      <PageShell
        title={data.title}
        description={data.description}
        selectedRange={data.selectedRange}
        actions={safeActions}
        onActionClick={handleHeaderAction}
      >
        {saveError ? <ErrorState message={saveError} /> : null}

        <BudgetSummaryHeader summary={data.summary ?? EMPTY_SUMMARY} />

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            {safeCategories.length === 0 ? (
              <EmptyState
                title="No budgets yet"
                detail="Create your first category budget after connecting an account so LedgerScope can track spending against it."
              />
            ) : (
              safeCategories.map((item) => (
                <BudgetCategoryCard
                  key={item.id}
                  item={item}
                  onEdit={(value) => {
                    setEditing(value);
                    setFormOpen(true);
                  }}
                  onDelete={(value) => setPendingDelete(value)}
                  deleteLoading={deleteLoadingId === item.id}
                />
              ))
            )}
          </div>

          <div className="space-y-4">
            <BudgetAlertsSection alerts={safeAlerts} />
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-slate-800 disabled:opacity-60"
              disabled={saveLoading}
            >
              {saveLoading ? "Saving..." : "Create Budget"}
            </button>
          </div>
        </section>

        <BudgetForecastSection forecast={forecast} />

        <BudgetFormModal
          open={formOpen}
          initial={editing}
          onClose={() => {
            if (saveLoading) return;
            setFormOpen(false);
            setEditing(null);
          }}
          onSubmit={handleSave}
        />
      </PageShell>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete budget?"
        description={pendingDelete ? `This will remove the '${pendingDelete.category}' budget and related monthly period data.` : ""}
        confirmLabel="Delete budget"
        confirmTone="danger"
        busy={Boolean(deleteLoadingId)}
        onCancel={() => {
          if (deleteLoadingId) return;
          setPendingDelete(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
