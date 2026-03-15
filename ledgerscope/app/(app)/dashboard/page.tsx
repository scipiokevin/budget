"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CategorySpendingComparisonChart } from "@/components/charts/category-spending-comparison-chart";
import { MonthlyCashflowChart } from "@/components/charts/monthly-cashflow-chart";
import { MonthlySpendingTrendChart } from "@/components/charts/monthly-spending-trend-chart";
import { NetWorthTrendChart } from "@/components/charts/net-worth-trend-chart";
import { SmartInsightItemCard } from "@/components/insights/smart-insight-card";
import { PageShell } from "@/components/layout/page-shell";
import { type HeaderAction } from "@/components/layout/top-header";
import { ConnectBankPanel, type ConnectBankPanelHandle } from "@/components/plaid/connect-bank-panel";
import { useToast } from "@/components/providers/toast-provider";
import { DataSurface, EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import { StatCard } from "@/components/ui/stat-card";
import { WidgetCard } from "@/components/ui/widget-card";
import { useApiData } from "@/lib/hooks/use-api-data";
import { appApi } from "@/lib/services/app-api-client";
import { formatCurrency, formatCurrencyAmount } from "@/lib/utils/format";
import type { DashboardScope } from "@/types/contracts";

const SCOPE_OPTIONS: Array<{ value: DashboardScope; label: string }> = [
  { value: "overall", label: "Overall" },
  { value: "personal", label: "Personal" },
  { value: "business", label: "Business" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { data, loading, error, reload } = useApiData(appApi.getDashboard);
  const { data: financialHealth, loading: financialHealthLoading } = useApiData(appApi.getFinancialHealth);

  const connectPanelRef = useRef<ConnectBankPanelHandle>(null);
  const [selectedScope, setSelectedScope] = useState<DashboardScope>("overall");
  const [topActionLoading, setTopActionLoading] = useState(false);
  const [currentActionLabel, setCurrentActionLabel] = useState<string | null>(null);
  const [topActionError, setTopActionError] = useState<string | null>(null);

  if (loading) {
    return (
      <PageShell title="Dashboard" description="Loading dashboard data...">
        <LoadingState label="Loading dashboard metrics and widgets..." />
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell title="Dashboard" description="Unable to load dashboard right now.">
        <ErrorState message={error ?? "Dashboard request failed."} onRetry={() => void reload()} />
      </PageShell>
    );
  }

  const scoped = data.scopedAnalytics[selectedScope] ?? data.scopedAnalytics.overall;
  const summary = scoped.summary;

  const headerActions = data.actions.map((action) => ({
    ...action,
    disabled: topActionLoading,
    loading: topActionLoading && currentActionLabel === action.label,
    loadingLabel: "Working...",
  }));

  async function handleHeaderAction(action: HeaderAction) {
    const label = action.label.toLowerCase();
    setTopActionError(null);

    if (label.includes("export")) {
      router.push("/exports");
      return;
    }

    setTopActionLoading(true);
    setCurrentActionLabel(action.label);

    try {
      if (label.includes("connect")) {
        await connectPanelRef.current?.connect();
        await reload();
        pushToast({ title: "Bank connected", message: "Connection completed and dashboard refreshed.", variant: "success" });
      } else if (label.includes("sync")) {
        const result = await appApi.syncTransactions();
        await reload();
        pushToast({
          title: "Sync complete",
          message: `${result.added} added, ${result.modified} updated, ${result.removed} removed.`,
          variant: "success",
        });
      } else {
        const message = `Action '${action.label}' is not wired yet.`;
        setTopActionError(message);
        pushToast({ title: "Action failed", message, variant: "error" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to complete this action.";
      setTopActionError(message);
      pushToast({ title: "Action failed", message, variant: "error" });
    } finally {
      setTopActionLoading(false);
      setCurrentActionLabel(null);
    }
  }

  const healthScore = financialHealth?.score ?? data.financialHealth.score;
  const isEmpty = data.monthlyTrends.length === 0 && data.recentAccountActivity.length === 0 && data.smartInsights.length === 0;

  return (
    <PageShell
      title={data.title}
      description={data.description}
      selectedRange={`${data.selectedRange} - ${SCOPE_OPTIONS.find((option) => option.value === selectedScope)?.label ?? "Overall"}`}
      actions={headerActions}
      onActionClick={(action) => void handleHeaderAction(action)}
    >
      {topActionLoading ? <LoadingState label="Running action..." /> : null}
      {topActionError ? <ErrorState message={topActionError} /> : null}
      <ConnectBankPanel ref={connectPanelRef} compact />

      {isEmpty ? (
        <EmptyState title="No dashboard data yet" detail="Connect a bank to start tracking spending and populate your dashboard." />
      ) : (
        <DataSurface>
          <section className="flex flex-wrap gap-2">
            {SCOPE_OPTIONS.map((option) => {
              const isActive = selectedScope === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedScope(option.value)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${isActive ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  {option.label}
                </button>
              );
            })}
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Total income" value={formatCurrency(summary.totalIncomeThisMonth)} trend="This month" tone="positive" align="right" />
            <StatCard label="Total expenses" value={formatCurrency(summary.totalExpensesThisMonth)} trend="This month" tone="warning" align="right" />
            <StatCard label="Net cash flow" value={formatCurrency(summary.netCashFlow)} trend={summary.netCashFlow >= 0 ? "Positive" : "Negative"} tone={summary.netCashFlow >= 0 ? "positive" : "warning"} align="right" />
            <StatCard label="Income-to-expense ratio" value={`${summary.incomeExpenseRatio.toFixed(2)}x`} trend="This month" tone="neutral" align="left" />
            <StatCard label="Financial health" value={financialHealthLoading ? "Loading..." : `${healthScore} / 100`} trend="Score out of 100" tone={healthScore >= 80 ? "positive" : healthScore >= 60 ? "warning" : "critical"} align="left" />
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <WidgetCard title="Monthly cashflow" description="Income, expenses, and net cash flow by month.">
              {scoped.monthlyTrends.length === 0 ? <p className="text-sm text-slate-500">No monthly cashflow data yet.</p> : <MonthlyCashflowChart points={scoped.monthlyTrends} />}
            </WidgetCard>
            <WidgetCard title="Category spending" description="Top categories by spend.">
              {data.spendingTrends.length === 0 ? <p className="text-sm text-slate-500">No category spending data yet.</p> : <CategorySpendingComparisonChart items={data.spendingTrends} />}
            </WidgetCard>
            <WidgetCard title="Monthly spending trend" description="Expense trend across recent months.">
              {scoped.monthlyTrends.length === 0 ? <p className="text-sm text-slate-500">No monthly spending trend yet.</p> : <MonthlySpendingTrendChart points={scoped.monthlyTrends} />}
            </WidgetCard>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <WidgetCard title="Smart insights" description="Plain-English guidance from synced data.">
              {data.smartInsights.length === 0 ? (
                <p className="text-sm text-slate-500">No active insights.</p>
              ) : (
                <div className="space-y-2">
                  {data.smartInsights.map((insight) => (
                    <SmartInsightItemCard key={insight.id} insight={insight} onDismiss={() => {}} />
                  ))}
                </div>
              )}
            </WidgetCard>
            <WidgetCard title="Recent account activity" description="Latest synced Plaid transactions.">
              {data.recentAccountActivity.length === 0 ? (
                <p className="text-sm text-slate-500">No recent synced activity available.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.recentAccountActivity.map((item) => (
                    <li key={item.id} className="rounded-md border border-slate-200 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-800">{item.merchant}</p>
                          <p className="text-xs text-slate-500">{item.date} - {item.account}</p>
                        </div>
                        <span className="font-medium text-slate-900">{formatCurrencyAmount(item.amount)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </WidgetCard>
            <WidgetCard title="Net worth trend" description="Linked assets trend snapshot.">
              <NetWorthTrendChart points={data.netWorth.trend} />
            </WidgetCard>
          </section>
        </DataSurface>
      )}
    </PageShell>
  );
}
