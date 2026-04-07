import type {
  BudgetUpsertPayload,
  BudgetUpsertResponse,
  BudgetsData,
  BusinessData,
  DashboardData,
  ExportCreatePayload,
  ExportCreateResponse,
  FinancialHealthMetricsData,
  ExportsData,
  ForecastOverviewData,
  IncomeData,
  InsightsData,
  StatementImportFinalizeResponse,
  StatementImportHistoryResponse,
  StatementImportUploadResponse,
  SettingsData,
  TransactionRecord,
  TransactionsData,
  TransactionsMutationRequest,
  TransactionsMutationResponse,
  TransactionsQuery,
  WatchlistData,
  WatchlistMutationRequest,
  WatchlistMutationResponse,
} from "@/types/contracts";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      ...init,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out for ${path}.`);
    }

    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail: string | undefined;

    try {
      const body = (await response.json()) as { error?: string };
      detail = body.error;
    } catch {
      detail = undefined;
    }

    throw new Error(detail ?? `Request failed for ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

function toQueryString(query: TransactionsQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));

  const optionalEntries: Array<[string, string | number | undefined]> = [
    ["search", query.search],
    ["dateFrom", query.dateFrom],
    ["dateTo", query.dateTo],
    ["merchant", query.merchant],
    ["category", query.category],
    ["account", query.account],
    ["purpose", query.purpose],
    ["status", query.status],
    ["amountMin", query.amountMin],
    ["amountMax", query.amountMax],
  ];

  for (const [key, value] of optionalEntries) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }

  return params.toString();
}

export const appApi = {
  getDashboard: () => requestJson<DashboardData>("/api/dashboard"),
  getFinancialHealth: () => requestJson<FinancialHealthMetricsData>("/api/analytics/financial-health"),
  getTransactions: (query: TransactionsQuery) => requestJson<TransactionsData>(`/api/transactions?${toQueryString(query)}`),
  getTransactionById: (id: string) => requestJson<TransactionRecord>(`/api/transactions?id=${id}`),
  mutateTransaction: (payload: TransactionsMutationRequest) =>
    requestJson<TransactionsMutationResponse>("/api/transactions", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  syncTransactions: (bankConnectionId?: string) =>
    requestJson<{ syncedConnections: number; added: number; modified: number; removed: number }>(
      "/api/plaid/transactions-sync",
      {
        method: "POST",
        body: JSON.stringify(bankConnectionId ? { bankConnectionId } : {}),
      },
    ),
  getBudgets: () => requestJson<BudgetsData>("/api/budgets"),
  createBudget: (payload: BudgetUpsertPayload) =>
    requestJson<BudgetUpsertResponse>("/api/budgets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateBudget: (payload: BudgetUpsertPayload) =>
    requestJson<BudgetUpsertResponse>("/api/budgets", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteBudget: (id: string) =>
    requestJson<{ success: boolean }>(`/api/budgets?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  getForecastOverview: () => requestJson<ForecastOverviewData>("/api/insights/forecast"),
  getInsights: () => requestJson<InsightsData>("/api/insights"),
  recomputeInsights: () =>
    requestJson<{ ok: boolean }>("/api/insights", {
      method: "POST",
    }),
  setTripAssignment: (transactionId: string, tripId: string | null) =>
    requestJson<{ ok: boolean }>("/api/insights", {
      method: "PATCH",
      body: JSON.stringify({ transactionId, tripId }),
    }),
  dismissSmartInsight: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/insights/${id}/dismiss`, {
      method: "POST",
    }),
  getIncome: () => requestJson<IncomeData>("/api/income"),
  getWatchlist: () => requestJson<WatchlistData>("/api/watchlist"),
  mutateWatchlist: (payload: WatchlistMutationRequest) =>
    requestJson<WatchlistMutationResponse>("/api/watchlist", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getExports: () => requestJson<ExportsData>("/api/exports"),
  createExport: (payload: ExportCreatePayload) =>
    requestJson<ExportCreateResponse>("/api/exports", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getStatementImportHistory: () => requestJson<StatementImportHistoryResponse>("/api/statement-imports"),
  uploadStatementPdf: async (file: File): Promise<StatementImportUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/statement-imports", {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    if (!response.ok) {
      let detail: string | undefined;

      try {
        const body = (await response.json()) as { error?: string };
        detail = body.error;
      } catch {
        detail = undefined;
      }

      throw new Error(detail ?? "Failed to upload statement PDF.");
    }

    return (await response.json()) as StatementImportUploadResponse;
  },
  finalizeStatementImport: (id: string, selectedEntryIds: string[]) =>
    requestJson<StatementImportFinalizeResponse>(`/api/statement-imports/${id}`, {
      method: "POST",
      body: JSON.stringify({ action: "confirm", selectedEntryIds }),
    }),
  cancelStatementImport: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/statement-imports/${id}`, {
      method: "POST",
      body: JSON.stringify({ action: "cancel" }),
    }),
  getSettings: () => requestJson<SettingsData>("/api/settings"),
  getBusiness: () => requestJson<BusinessData>("/api/business"),
};
