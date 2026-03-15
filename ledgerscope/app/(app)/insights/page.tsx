"use client";

import { useEffect, useMemo, useState } from "react";
import { SmartInsightItemCard } from "@/components/insights/smart-insight-card";
import { PageShell } from "@/components/layout/page-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import { WidgetCard } from "@/components/ui/widget-card";
import { useApiData } from "@/lib/hooks/use-api-data";
import { appApi } from "@/lib/services/app-api-client";
import { formatCurrencyAmount } from "@/lib/utils/format";

export default function InsightsPage() {
  const { data, loading, error, reload } = useApiData(appApi.getInsights);
  const [days, setDays] = useState(7);
  const [travelers, setTravelers] = useState(2);
  const [tripUpdateLoadingId, setTripUpdateLoadingId] = useState<string | null>(null);
  const [tripUpdateError, setTripUpdateError] = useState<string | null>(null);
  const [tripUpdateSuccess, setTripUpdateSuccess] = useState<string | null>(null);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [dismissedInsightIds, setDismissedInsightIds] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    setDays(Math.max(1, Number(data.projectionDefaults?.days) || 7));
    setTravelers(Math.max(1, Number(data.projectionDefaults?.travelers) || 2));
  }, [data]);

  const safeTripSummaries = useMemo(() => (Array.isArray(data?.tripSummaries) ? data.tripSummaries : []), [data?.tripSummaries]);
  const safeSmartInsights = useMemo(() => (Array.isArray(data?.smartInsights) ? data.smartInsights : []), [data?.smartInsights]);
  const safeRecurringCharges = useMemo(() => (Array.isArray(data?.recurringCharges) ? data.recurringCharges : []), [data?.recurringCharges]);
  const safeMortgageRates = {
    average30Year: Number(data?.mortgageRates?.average30Year ?? 0),
    average15Year: Number(data?.mortgageRates?.average15Year ?? 0),
    asOf: data?.mortgageRates?.asOf ?? "N/A",
    sourceLabel: data?.mortgageRates?.sourceLabel ?? "Market averages",
  };

  const projection = useMemo(() => {
    if (!data?.projectionBaseline) {
      return {
        expectedTotal: 0,
        lowEstimate: 0,
        highEstimate: 0,
        expectedCostPerDay: 0,
        expectedCostPerTraveler: 0,
      };
    }

    const expectedTotal = Number((data.projectionBaseline.baseCostPerTravelerDay * Math.max(1, days) * Math.max(1, travelers)).toFixed(2));

    return {
      expectedTotal,
      lowEstimate: Number((expectedTotal * 0.85).toFixed(2)),
      highEstimate: Number((expectedTotal * 1.2).toFixed(2)),
      expectedCostPerDay: Number((expectedTotal / Math.max(1, days)).toFixed(2)),
      expectedCostPerTraveler: Number((expectedTotal / Math.max(1, travelers)).toFixed(2)),
    };
  }, [data, days, travelers]);

  if (loading) {
    return (
      <PageShell title="Insights & Planning" description="Loading insights...">
        <LoadingState label="Loading trip history and planning insights..." />
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell title="Insights & Planning" description="Unable to load insights.">
        <ErrorState message={error ?? "Failed to load insights"} onRetry={() => void reload()} />
      </PageShell>
    );
  }

  const tripOptions = safeTripSummaries.map((trip) => ({ id: trip.id, label: trip.tripLabel }));
  const visibleInsights = safeSmartInsights.filter((insight) => !dismissedInsightIds.includes(insight.id));

  async function handleTripReassign(transactionId: string, nextTripId: string) {
    setTripUpdateLoadingId(transactionId);
    setTripUpdateError(null);
    setTripUpdateSuccess(null);

    try {
      await appApi.setTripAssignment(transactionId, nextTripId === "__auto" ? null : nextTripId);
      setTripUpdateSuccess("Trip assignment updated.");
      await reload();
      setTimeout(() => setTripUpdateSuccess(null), 1800);
    } catch (err) {
      setTripUpdateError(err instanceof Error ? err.message : "Failed to update trip assignment.");
    } finally {
      setTripUpdateLoadingId(null);
    }
  }

  async function dismissInsight(id: string) {
    setDismissError(null);
    try {
      await appApi.dismissSmartInsight(id);
      setDismissedInsightIds((prev) => [...prev, id]);
    } catch (err) {
      setDismissError(err instanceof Error ? err.message : "Failed to dismiss insight.");
    }
  }

  return (
    <PageShell title={data.title} description={data.description} selectedRange={data.selectedRange} actions={data.actions}>
      {tripUpdateError ? <ErrorState message={tripUpdateError} /> : null}
      {dismissError ? <ErrorState message={dismissError} /> : null}
      {tripUpdateSuccess ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{tripUpdateSuccess}</p> : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <WidgetCard title="Smart insights" description="Plain-English guidance from synced data and budgets.">
          {visibleInsights.length === 0 ? (
            <p className="text-sm text-slate-500">No active insights right now.</p>
          ) : (
            <div className="space-y-2">
              {visibleInsights.map((insight) => (
                <SmartInsightItemCard key={insight.id} insight={insight} onDismiss={(id) => void dismissInsight(id)} />
              ))}
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Mortgage rates widget" description="Latest market averages, not personalized lender quotes.">
          <div className="space-y-2 text-sm">
            <p>
              30-year fixed average: <strong>{safeMortgageRates.average30Year.toFixed(2)}%</strong>
            </p>
            <p>
              15-year fixed average: <strong>{safeMortgageRates.average15Year.toFixed(2)}%</strong>
            </p>
            <p className="text-xs text-slate-500">
              As of {safeMortgageRates.asOf} | {safeMortgageRates.sourceLabel}
            </p>
          </div>
        </WidgetCard>

        <WidgetCard title="Recurring charges" description="Likely subscriptions and recurring expenses from synced transactions.">
          <p className="mb-2 text-sm text-slate-700">{data.recurringChargesSummary ?? "Recurring charge estimates will appear after sync."}</p>
          {safeRecurringCharges.length === 0 ? (
            <p className="text-sm text-slate-500">No recurring charges detected yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {safeRecurringCharges.map((item) => (
                <div key={`${item.merchant}-${item.estimatedFrequency}`} className="rounded-md border border-slate-200 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-800">{item.merchant}</p>
                    <p className="font-medium text-slate-900">{formatCurrencyAmount(item.estimatedMonthlyCost)}/mo</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Frequency: {item.estimatedFrequency} | Charges observed: {item.recentChargeCount}
                  </p>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Future trip projection" description="Estimate future travel cost from real tagged trip history.">
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="text-slate-600">Trip days</span>
              <input
                type="number"
                min={1}
                value={days}
                onChange={(event) => setDays(Math.max(1, Number(event.target.value) || 1))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-slate-600">Travelers</span>
              <input
                type="number"
                min={1}
                value={travelers}
                onChange={(event) => setTravelers(Math.max(1, Number(event.target.value) || 1))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <p>
              Expected total: <strong>{formatCurrencyAmount(projection.expectedTotal)}</strong>
            </p>
            <p>Low estimate: {formatCurrencyAmount(projection.lowEstimate)}</p>
            <p>High estimate: {formatCurrencyAmount(projection.highEstimate)}</p>
            <p>Expected cost/day: {formatCurrencyAmount(projection.expectedCostPerDay)}</p>
            <p>Expected cost/traveler: {formatCurrencyAmount(projection.expectedCostPerTraveler)}</p>
          </div>
        </WidgetCard>
      </section>

      <section className="mt-4">
        {safeTripSummaries.length === 0 ? (
          <EmptyState title="No trip history yet" detail="Tag expenses as vacation, holiday, or business trip to build travel summaries." />
        ) : (
          <div className="grid gap-4">
            {safeTripSummaries.map((trip) => (
              <WidgetCard key={trip.id} title={trip.tripLabel} description={`${trip.startDate} - ${trip.endDate}`}>
                <div className="grid gap-2 text-sm md:grid-cols-4">
                  <p>
                    Total trip cost: <strong>{formatCurrencyAmount(trip.totalTripCost)}</strong>
                  </p>
                  <p>
                    Cost per day: <strong>{formatCurrencyAmount(trip.costPerDay)}</strong>
                  </p>
                  <p>
                    Cost per traveler: <strong>{formatCurrencyAmount(trip.costPerTraveler)}</strong>
                  </p>
                  <p>
                    Travelers: <strong>{trip.travelers}</strong>
                  </p>
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  Category breakdown: {(Array.isArray(trip.categoryBreakdown) ? trip.categoryBreakdown : []).map((item) => `${item.category} ${formatCurrencyAmount(item.amount)}`).join(" | ")}
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Trip transactions</p>
                  <div className="space-y-2">
                    {(Array.isArray(trip.transactions) ? trip.transactions : []).map((tx) => (
                      <div key={tx.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-slate-800">{tx.merchant}</p>
                            <p className="text-xs text-slate-500">
                              {tx.date} | {tx.category} | {formatCurrencyAmount(tx.amount)}
                            </p>
                          </div>
                          <select
                            value={trip.id}
                            onChange={(event) => void handleTripReassign(tx.id, event.target.value)}
                            disabled={tripUpdateLoadingId === tx.id}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50"
                          >
                            <option value="__auto">Auto assign</option>
                            {tripOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </WidgetCard>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
