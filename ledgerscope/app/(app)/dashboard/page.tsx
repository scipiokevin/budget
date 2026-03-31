"use client";

import { useEffect, useRef, useState } from "react";
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
import type { DashboardScope, SmartInsightCard } from "@/types/contracts";

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
  const [accountActionId, setAccountActionId] = useState<string | null>(null);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [dismissingInsightId, setDismissingInsightId] = useState<string | null>(null);
  const [visibleInsights, setVisibleInsights] = useState<SmartInsightCard[]>([]);

  useEffect(() => {
    setVisibleInsights(Array.isArray(data?.smartInsights) ? data.smartInsights : []);
  }, [data?.smartInsights]);

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

  async function handleRepairConnection(bankConnectionId: string, accountName: string) {
    setAccountActionId(bankConnectionId);
    setTopActionError(null);

    try {
      await connectPanelRef.current?.connect(bankConnectionId);
      await reload();
      pushToast({
        title: "Connection restored",
        message: `${accountName} is ready to sync again.`,
        variant: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reconnect this bank right now.";
      setTopActionError(message);
      pushToast({ title: "Reconnect failed", message, variant: "error" });
    } finally {
      setAccountActionId(null);
    }
  }

  async function handleDismissInsight(insightId: string) {
    const previousInsights = visibleInsights;
    setDismissError(null);
    setDismissingInsightId(insightId);
    setVisibleInsights((current) => current.filter((insight) => insight.id !== insightId));

    try {
      await appApi.dismissSmartInsight(insightId);
      pushToast({ title: "Insight dismissed", message: "This insight has been removed from your dashboard.", variant: "success" });
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to dismiss insight.";
      setDismissError(message);
      setVisibleInsights(previousInsights);
      pushToast({ title: "Dismiss failed", message, variant: "error" });
    } finally {
      setDismissingInsightId(null);
    }
  }

  function statusClasses(status: "active" | "inactive" | "error", requiresReconnect: boolean) {
    if (requiresReconnect || status === "error") {
      return "border-rose-200 bg-rose-50 text-rose-700";
    }

    if (status === "inactive") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }

    return "border-emerald-200 bg-emerald-50 text-emerald-700";
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
      {dismissError ? <ErrorState message={dismissError} /> : null}
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

          <section className="grid gap-4 xl:grid-cols-4">
            <WidgetCard title="Smart insights" description="Plain-English guidance from synced data.">
              {visibleInsights.length === 0 ? (
                <p className="text-sm text-slate-500">No active insights.</p>
              ) : (
                <div className="space-y-2">
                  {visibleInsights.map((insight) => (
                    <SmartInsightItemCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismissingInsightId ? undefined : (id) => void handleDismissInsight(id)}
                    />
                  ))}
                </div>
              )}
            </WidgetCard>
            <WidgetCard title="Connected accounts" description={data.lastSyncedAt ? `Last portfolio sync ${new Date(data.lastSyncedAt).toLocaleString()}.` : "Connected banks and connection health."}>
              {data.linkedAccounts.length === 0 ? (
                <EmptyState
                  title="No banks connected"
                  detail="Connect a bank to import balances, transactions, and automatic sync updates."
                />
              ) : (
                <ul className="space-y-3 text-sm">
                  {data.linkedAccounts.map((account) => (
                    <li key={account.id} className="rounded-xl border border-slate-200 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-900">{account.name}</p>
                          <p className="text-xs text-slate-500">
                            {account.institutionName ?? "Connected institution"}
                            {account.mask ? ` • •••• ${account.mask}` : ""}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] ${statusClasses(account.connectionStatus, account.requiresReconnect)}`}>
                              {account.requiresReconnect ? "Reconnect required" : account.connectionStatus}
                            </span>
                            {account.lastSyncedAt ? (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                Synced {new Date(account.lastSyncedAt).toLocaleDateString()}
                              </span>
                            ) : null}
                          </div>
                          {account.itemErrorMessage ? <p className="text-xs text-rose-600">{account.itemErrorMessage}</p> : null}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-900">
                            {typeof account.currentBalance === "number" ? formatCurrencyAmount(account.currentBalance) : "Balance pending"}
                          </p>
                          {account.requiresReconnect ? (
                            <button
                              type="button"
                              onClick={() => void handleRepairConnection(account.bankConnectionId, account.name)}
                              disabled={accountActionId === account.bankConnectionId}
                              className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {accountActionId === account.bankConnectionId ? "Repairing..." : "Reconnect"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </WidgetCard>
            <WidgetCard title="Recent account activity" description="Latest synced Plaid transactions.">
              {data.recentAccountActivity.length === 0 ? (
                <EmptyState title="No recent activity" detail="Run a sync after connecting a bank to populate recent account activity." />
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
              {data.netWorth.trend.length === 0 ? (
                <EmptyState title="No asset trend yet" detail="Connect at least one bank account to start building a net worth trend." />
              ) : (
                <NetWorthTrendChart points={data.netWorth.trend} />
              )}
            </WidgetCard>
          </section>
        </DataSurface>
      )}
    </PageShell>
  );
}
