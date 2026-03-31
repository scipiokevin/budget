"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { type HeaderAction } from "@/components/layout/top-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import { SplitTransactionModal } from "@/components/transactions/split-transaction-modal";
import { TransactionDetailDrawer } from "@/components/transactions/transaction-detail-drawer";
import { TransactionsFilters } from "@/components/transactions/transactions-filters";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { useToast } from "@/components/providers/toast-provider";
import { appApi } from "@/lib/services/app-api-client";
import type { TransactionPurpose, TransactionRecord, TransactionsData, TransactionsFilterOptions, TransactionsQuery } from "@/types/contracts";

const initialQuery: TransactionsQuery = {
  page: 1,
  pageSize: 10,
};

const emptyFilterOptions: TransactionsFilterOptions = {
  merchants: [],
  categories: [],
  accounts: [],
  purposes: ["personal", "business", "split", "uncertain"],
  statuses: ["posted", "pending"],
};

const defaultHeaderActions = [
  { label: "Sync Now", variant: "primary" as const },
  { label: "Export", variant: "secondary" as const },
];

export default function TransactionsPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const [query, setQuery] = useState<TransactionsQuery>(initialQuery);
  const [draftQuery, setDraftQuery] = useState<TransactionsQuery>(initialQuery);
  const [data, setData] = useState<TransactionsData | null>(null);
  const [selected, setSelected] = useState<TransactionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentActionLabel, setCurrentActionLabel] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationSuccess, setMutationSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await appApi.getTransactions(query);
      setData(result);

      if (selected?.id) {
        try {
          const latest = await appApi.getTransactionById(selected.id);
          setSelected(latest);
        } catch {
          setSelected(null);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load transactions.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [query, selected?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageTitle = data?.title ?? "Transactions";
  const pageDescription = data?.description ?? "Search, review, and classify recent account activity.";
  const actions = data?.actions ?? defaultHeaderActions;

  const headerActions = useMemo(
    () =>
      actions.map((action) => ({
        ...action,
        disabled: actionLoading,
        loading: actionLoading && currentActionLabel === action.label,
        loadingLabel: `Working...`,
      })),
    [actions, actionLoading, currentActionLabel],
  );

  const safeItems = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data?.items]);
  const safeFilterOptions = useMemo(() => {
    const options = data?.filterOptions;
    if (!options) return emptyFilterOptions;

    return {
      merchants: Array.isArray(options.merchants) ? options.merchants : [],
      categories: Array.isArray(options.categories) ? options.categories : [],
      accounts: Array.isArray(options.accounts) ? options.accounts : [],
      purposes: Array.isArray(options.purposes) && options.purposes.length > 0 ? options.purposes : emptyFilterOptions.purposes,
      statuses: Array.isArray(options.statuses) && options.statuses.length > 0 ? options.statuses : emptyFilterOptions.statuses,
    };
  }, [data?.filterOptions]);

  async function handleTopAction(action: HeaderAction) {
    const label = action.label.toLowerCase();
    setActionError(null);
    setActionSuccess(null);

    if (label.includes("export")) {
      router.push("/exports");
      return;
    }

    if (label.includes("sync")) {
      setActionLoading(true);
      setCurrentActionLabel(action.label);

      try {
        const result = await appApi.syncTransactions();
        await load();
        const message = `Sync complete: ${result.added} added, ${result.modified} updated, ${result.removed} removed.`;
        setActionSuccess(message);
        pushToast({ title: "Transactions synced", message, variant: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to sync transactions.";
        setActionError(message);
        pushToast({ title: "Sync failed", message, variant: "error" });
      } finally {
        setActionLoading(false);
        setCurrentActionLabel(null);
      }

      return;
    }

    const message = `Action '${action.label}' is not wired yet.`;
    setActionError(message);
    pushToast({ message, variant: "error" });
  }

  async function mutateAndRefresh(payload: Parameters<typeof appApi.mutateTransaction>[0], successMessage: string) {
    setMutationLoading(true);
    setMutationError(null);
    setMutationSuccess(null);

    try {
      const result = await appApi.mutateTransaction(payload);

      setData((prev) => {
        if (!prev) return prev;
        const prevItems = Array.isArray(prev.items) ? prev.items : [];
        return {
          ...prev,
          items: prevItems.map((item) => (item.id === result.transaction.id ? result.transaction : item)),
        };
      });

      setSelected((prev) => {
        if (!prev || prev.id !== result.transaction.id) return prev;
        return result.transaction;
      });

      await load();
      setMutationSuccess(successMessage);
      pushToast({ message: successMessage, variant: "success" });
      setTimeout(() => setMutationSuccess(null), 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save transaction changes.";
      setMutationError(message);
      pushToast({ title: "Transaction update failed", message, variant: "error" });
    } finally {
      setMutationLoading(false);
    }
  }

  const isEmpty = useMemo(() => !loading && !error && safeItems.length === 0, [loading, error, safeItems.length]);

  return (
    <PageShell
      title={pageTitle}
      description={pageDescription}
      selectedRange="This month"
      actions={headerActions}
      onActionClick={(action) => void handleTopAction(action)}
    >
      {loading ? <LoadingState label="Loading transactions..." /> : null}
      {actionLoading ? <LoadingState label="Running action..." /> : null}
      {actionError ? <ErrorState message={actionError} /> : null}
      {actionSuccess ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{actionSuccess}</p> : null}

      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {!loading && !error ? (
        <>
          <TransactionsFilters
            query={draftQuery}
            filterOptions={safeFilterOptions}
            onChange={(next) => setDraftQuery((prev) => ({ ...prev, ...next, page: 1 }))}
            onApply={() => {
              setActionSuccess("Filters applied.");
              pushToast({ message: "Filters applied.", variant: "success" });
              setTimeout(() => setActionSuccess(null), 1200);
              setQuery(draftQuery);
            }}
            onReset={() => {
              setDraftQuery(initialQuery);
              setQuery(initialQuery);
              setActionSuccess("Filters reset.");
              pushToast({ message: "Filters reset.", variant: "info" });
              setTimeout(() => setActionSuccess(null), 1200);
            }}
          />

          {isEmpty ? (
            <EmptyState
              title="No transactions found"
              detail="Try adjusting filters, or use Sync Now after connecting a bank to pull recent account activity."
            />
          ) : (
            <TransactionsTable
              items={safeItems}
              page={data?.query?.page ?? 1}
              totalPages={data?.totalPages ?? 1}
              totalCount={data?.totalCount ?? 0}
              onPageChange={(page) => {
                const nextQuery = { ...query, page };
                setQuery(nextQuery);
                setDraftQuery(nextQuery);
              }}
              onSelect={setSelected}
            />
          )}

          <TransactionDetailDrawer
            open={Boolean(selected)}
            transaction={selected}
            categories={safeFilterOptions.categories}
            mutationLoading={mutationLoading}
            mutationError={mutationError}
            mutationSuccess={mutationSuccess}
            onClose={() => {
              setSelected(null);
              setMutationError(null);
              setMutationSuccess(null);
            }}
            onUpdateCategory={(id, category) => mutateAndRefresh({ action: "updateCategory", id, category }, "Category updated.")}
            onUpdatePurpose={(id, purpose: TransactionPurpose) =>
              mutateAndRefresh({ action: "updatePurpose", id, purpose }, "Purpose label updated.")
            }
            onToggleSuspicious={(id, isSuspicious) => mutateAndRefresh({ action: "flagSuspicious", id, isSuspicious }, "Suspicious flag updated.")}
            onAddNote={(id, note) => mutateAndRefresh({ action: "addNote", id, note }, "Note added.")}
            onSetExpenseTags={(id, tags) => mutateAndRefresh({ action: "setExpenseTags", id, tags }, "Expense tags updated.")}
            onSetCustomTags={(id, tags) => mutateAndRefresh({ action: "setCustomTags", id, tags }, "Custom tags updated.")}
            onMarkReviewed={(id, reviewed) =>
              mutateAndRefresh({ action: "markReviewed", id, reviewStatus: reviewed ? "reviewed" : "unreviewed" }, "Review state updated.")
            }
            onOpenSplit={() => setSplitOpen(true)}
          />

          <SplitTransactionModal
            open={splitOpen}
            transaction={selected}
            onClose={() => setSplitOpen(false)}
            onSubmit={async (split) => {
              if (!selected) return;
              await mutateAndRefresh({ action: "split", id: selected.id, split }, "Split values updated.");
            }}
          />
        </>
      ) : null}
    </PageShell>
  );
}

