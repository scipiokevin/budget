"use client";

import { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { DataSurface, EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import { WidgetCard } from "@/components/ui/widget-card";
import { useApiData } from "@/lib/hooks/use-api-data";
import { appApi } from "@/lib/services/app-api-client";
import { formatCurrencyAmount } from "@/lib/utils/format";

export default function WatchlistPage() {
  const { data, loading, error, reload } = useApiData(appApi.getWatchlist);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationSuccess, setMutationSuccess] = useState<string | null>(null);

  const activeRules = useMemo(() => (Array.isArray(data?.activeRules) ? data.activeRules : []), [data?.activeRules]);
  const recentMatches = useMemo(() => (Array.isArray(data?.recentMatches) ? data.recentMatches : []), [data?.recentMatches]);
  const suspiciousCandidates = useMemo(
    () => (Array.isArray(data?.suspiciousCandidates) ? data.suspiciousCandidates : []),
    [data?.suspiciousCandidates],
  );

  async function mutate(action: Parameters<typeof appApi.mutateWatchlist>[0], successMessage: string) {
    setMutationLoading(true);
    setMutationError(null);
    setMutationSuccess(null);

    try {
      await appApi.mutateWatchlist(action);
      setMutationSuccess(successMessage);
      await reload();
      setTimeout(() => setMutationSuccess(null), 1800);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Watchlist update failed.");
    } finally {
      setMutationLoading(false);
    }
  }

  if (loading) {
    return (
      <PageShell title="Watchlist" description="Loading watchlist...">
        <LoadingState label="Loading watch rules and match activity..." />
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell title="Watchlist" description="Unable to load watchlist right now.">
        <ErrorState message={error ?? "Watchlist request failed."} onRetry={() => void reload()} />
      </PageShell>
    );
  }

  const isEmpty = activeRules.length === 0 && recentMatches.length === 0 && suspiciousCandidates.length === 0;

  return (
    <PageShell title={data.title} description={data.description} selectedRange={data.selectedRange} actions={data.actions}>
      {isEmpty ? (
        <EmptyState title="No watchlist data yet" detail="No suspicious transactions flagged yet. Flag one from Transactions to create a watch rule." />
      ) : (
        <DataSurface>
          {mutationLoading ? <LoadingState label="Applying watchlist update..." /> : null}
          {mutationError ? <ErrorState message={mutationError} /> : null}
          {mutationSuccess ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{mutationSuccess}</p> : null}

          <section className="grid gap-4 xl:grid-cols-2">
            <WidgetCard title="Suspicious candidates" description="Create watch rules directly from flagged transactions.">
              {suspiciousCandidates.length === 0 ? (
                <p className="text-sm text-slate-500">No suspicious transactions flagged yet.</p>
              ) : (
                <div className="space-y-2">
                  {suspiciousCandidates.map((tx) => (
                    <div key={tx.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-800">{tx.merchant}</p>
                          <p className="text-xs text-slate-500">
                            {tx.date} | {tx.category} | {formatCurrencyAmount(tx.amount)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void mutate(
                              { action: "createFromTransaction", transactionId: tx.id, matchType: "fuzzy", amountTolerancePct: 5 },
                              "Watch rule created from suspicious transaction.",
                            )
                          }
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50"
                          disabled={mutationLoading}
                        >
                          Create rule
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WidgetCard>

            <WidgetCard title="Active watch rules" description="Merchant patterns, amount ranges, and merchant notes.">
              {activeRules.length === 0 ? (
                <p className="text-sm text-slate-500">No active watch rules yet.</p>
              ) : (
                <div className="space-y-2">
                  {activeRules.map((rule) => (
                    <div key={rule.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-800">{rule.merchantPattern}</p>
                          <p className="text-xs text-slate-500">
                            {rule.matchType.toUpperCase()} | {typeof rule.amountMin === "number" ? formatCurrencyAmount(rule.amountMin) : "-"} to {typeof rule.amountMax === "number" ? formatCurrencyAmount(rule.amountMax) : "-"}
                          </p>
                          {rule.note ? <p className="text-xs text-slate-600">Note: {rule.note}</p> : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void mutate({ action: "updateRule", ruleId: rule.id, isActive: false }, "Watch rule archived.")}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50"
                          disabled={mutationLoading}
                        >
                          Disable
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WidgetCard>
          </section>

          <section>
            <WidgetCard title="Recent matches" description="Dismiss or escalate potential repeat suspicious charges.">
              {recentMatches.length === 0 ? (
                <p className="text-sm text-slate-500">No watchlist matches yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentMatches.map((match) => (
                    <div key={match.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-800">{match.merchant}</p>
                          <p className="text-xs text-slate-500">
                            {match.date} | {formatCurrencyAmount(match.amount)} | Rule: {match.watchRuleLabel}
                          </p>
                          <p className="text-xs text-slate-600">
                            Status: {match.status}
                            {match.merchantNote ? ` | Note: ${match.merchantNote}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void mutate({ action: "setMatchStatus", matchId: match.id, status: "dismissed" }, "Match dismissed.")}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50"
                            disabled={mutationLoading}
                          >
                            Dismiss
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void mutate({ action: "escalateMatch", matchId: match.id, reason: "Escalated from watchlist UI" }, "Match escalated for review.")
                            }
                            className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white transition-colors duration-150 hover:bg-slate-800"
                            disabled={mutationLoading}
                          >
                            Escalate
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WidgetCard>
          </section>
        </DataSurface>
      )}
    </PageShell>
  );
}
