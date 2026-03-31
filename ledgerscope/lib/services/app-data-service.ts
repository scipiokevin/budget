import {
  deleteBudgetInPrisma,
  getBudgetsDataFromPrisma,
  getDashboardBudgetBundleFromPrisma,
  getForecastOverviewFromPrisma,
  upsertBudgetInPrisma,
} from "@/lib/db/budget-forecast-store";
import { getInsightsDataFromPrisma } from "@/lib/db/insights-store";
import { createExportInPrisma, getExportsDataFromPrisma } from "@/lib/db/exports-store";
import { getWatchlistDataFromPrisma, mutateWatchlistInPrisma } from "@/lib/db/watchlist-store";
import { getSmartInsightsFromPrisma, recomputeSmartInsights } from "@/lib/db/smart-insights-store";
import {
  getDashboardCashflowSnapshot,
  getLatestSyncTimestampFromPrisma,
  getLinkedAccountsFromPrisma,
  getTransactionByIdFromPrisma,
  getTransactionsDataFromPrisma,
  mutateTransactionInPrisma,
} from "@/lib/db/transaction-store";
import { calculateFinancialHealthScore } from "@/lib/services/financial-health";
import { getLatestMortgageRates } from "@/lib/services/mortgage-rates";
import type {
  BudgetRiskItem,
  BudgetUpsertPayload,
  BudgetUpsertResponse,
  BudgetsData,
  BusinessData,
  DashboardAccountActivityItem,
  DashboardData,
  ExportCreatePayload,
  ExportCreateResponse,
  ExportsData,
  ForecastOverviewData,
  IncomeData,
  InsightsData,
  ModuleData,
  NetWorthSnapshot,
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

export interface AppDataService {
  getDashboard(userId: string): Promise<DashboardData>;
  getTransactions(userId: string, query: TransactionsQuery): Promise<TransactionsData>;
  getTransactionById(userId: string, id: string): Promise<TransactionRecord | null>;
  mutateTransaction(userId: string, payload: TransactionsMutationRequest): Promise<TransactionsMutationResponse>;
  getBudgets(userId: string): Promise<BudgetsData>;
  upsertBudget(userId: string, payload: BudgetUpsertPayload): Promise<BudgetUpsertResponse>;
  deleteBudget(userId: string, id: string): Promise<void>;
  getForecastOverview(userId: string): Promise<ForecastOverviewData>;
  getInsights(userId: string): Promise<InsightsData>;
  getIncome(): Promise<IncomeData>;
  getWatchlist(userId: string): Promise<WatchlistData>;
  mutateWatchlist(userId: string, payload: WatchlistMutationRequest): Promise<WatchlistMutationResponse>;
  getExports(userId: string): Promise<ExportsData>;
  createExport(userId: string, payload: ExportCreatePayload): Promise<ExportCreateResponse>;
  getSettings(): Promise<SettingsData>;
  getBusiness(): Promise<BusinessData>;
}

const MOCK_LATENCY_MS = 120;

function withLatency<T>(data: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), MOCK_LATENCY_MS);
  });
}

const dashboardMeta = {
  title: "Dashboard",
  description: "Monitor income, expenses, budget health, and upcoming payroll signals.",
  selectedRange: "This month",
  actions: [
    { label: "Connect Bank", variant: "primary" as const },
    { label: "Sync Accounts", variant: "secondary" as const },
    { label: "Export Snapshot", variant: "secondary" as const },
  ],
  nextExpectedPaycheck: {
    employer: "Northline Logistics",
    date: "Mar 13, 2026",
    amount: 2350,
  },
};

const moduleData: Record<"income" | "settings" | "business", ModuleData> = {
  income: {
    title: "Income",
    description: "Payroll signals, classifications, and forecasts.",
    selectedRange: "This month",
    actions: [
      { label: "Confirm Employer", variant: "primary" },
      { label: "Run Detection", variant: "secondary" },
    ],
    sections: [
      { title: "Paycheck timeline", description: "Recent and upcoming payroll events.", rows: ["Mar 13 expected $2,350", "Feb 27 received $2,341", "Feb 13 received $2,347"] },
      { title: "Income sources", description: "Classified credits.", rows: ["Salary/Payroll 72%", "Business income 21%", "Refund/Reimbursement 7%"] },
    ],
  },
  settings: {
    title: "Settings",
    description: "Manage account preferences and integrations.",
    selectedRange: "This month",
    actions: [
      { label: "Save Changes", variant: "primary" },
      { label: "Reset", variant: "secondary" },
    ],
    sections: [
      { title: "Profile & notifications", description: "User settings summary.", rows: ["Email alerts: enabled", "Weekly recap: enabled", "Timezone: Asia/Bangkok"] },
      { title: "Integrations", description: "Connected service status.", rows: ["Plaid: sandbox", "Email provider: mock", "Redis queue: pending setup"] },
    ],
  },
  business: {
    title: "Personal vs Business",
    description: "Review and split mixed-purpose transactions.",
    selectedRange: "This month",
    actions: [
      { label: "Create Split Rule", variant: "primary" },
      { label: "Review Uncertain", variant: "secondary" },
    ],
    sections: [
      { title: "Uncertain queue", description: "Transactions awaiting purpose confirmation.", rows: ["9 items marked uncertain", "3 recent split suggestions", "2 rule conflicts to review"] },
      { title: "Monthly split totals", description: "Current month allocation.", rows: ["Personal spend $4,870", "Business spend $1,255", "Split transactions 18"] },
    ],
  },
};

function computeBudgetRisk(
  budgetProgress: DashboardData["budgetProgress"],
  forecastVsBudget: DashboardData["forecastVsBudget"],
): BudgetRiskItem[] {
  const usageMap = new Map(budgetProgress.map((item) => [item.category, item.usedPercent]));

  return forecastVsBudget
    .map((item) => {
      const usedPercent = usageMap.get(item.label) ?? 0;
      const projectedPercent = item.budget > 0 ? Number(((item.projected / item.budget) * 100).toFixed(1)) : 0;
      const remainingAmount = Number((item.budget - item.actual).toFixed(2));
      const riskLevel: BudgetRiskItem["riskLevel"] =
        projectedPercent >= 100 || usedPercent >= 100 ? "critical" : projectedPercent >= 85 || usedPercent >= 80 ? "watch" : "safe";

      return {
        category: item.label,
        usedPercent,
        projectedPercent,
        remainingAmount,
        riskLevel,
      };
    })
    .sort((a, b) => b.projectedPercent - a.projectedPercent)
    .slice(0, 5);
}


function buildNetWorthSnapshot(
  linkedAccounts: DashboardData["linkedAccounts"],
  monthlyTrends: DashboardData["monthlyTrends"],
): NetWorthSnapshot {
  const totalAssets = Number(
    linkedAccounts.reduce((sum, account) => sum + (typeof account.currentBalance === "number" ? account.currentBalance : 0), 0).toFixed(2),
  );
  const manualAssetsPlaceholder = 0;
  const manualLiabilitiesPlaceholder = 0;
  const totalLiabilities = Number(manualLiabilitiesPlaceholder.toFixed(2));
  const netWorth = Number((totalAssets + manualAssetsPlaceholder - totalLiabilities).toFixed(2));

  const trend = monthlyTrends.map((point) => {
    const liabilities = manualLiabilitiesPlaceholder;
    const rollingNetWorth = Number((netWorth + point.netCashFlow).toFixed(2));
    return {
      label: point.month,
      assets: Number((totalAssets + point.netCashFlow).toFixed(2)),
      liabilities,
      netWorth: rollingNetWorth,
    };
  });

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    manualAssetsPlaceholder,
    manualLiabilitiesPlaceholder,
    trend,
  };
}

class AppDataServiceImpl implements AppDataService {
  async getDashboard(userId: string) {
    const [budgetBundle, cashflow, mortgageRates, recentPrismaTransactions, linkedAccounts, lastSyncedAt] = await Promise.all([
      getDashboardBudgetBundleFromPrisma(userId),
      getDashboardCashflowSnapshot(userId),
      getLatestMortgageRates(),
      getTransactionsDataFromPrisma(userId, { page: 1, pageSize: 6 }),
      getLinkedAccountsFromPrisma(userId),
      getLatestSyncTimestampFromPrisma(userId),
    ]);

    let smartInsights = await getSmartInsightsFromPrisma(userId);
    if (smartInsights.length === 0) {
      await recomputeSmartInsights(userId);
      smartInsights = await getSmartInsightsFromPrisma(userId);
    }

    const recentAccountActivity: DashboardAccountActivityItem[] = recentPrismaTransactions.items.map((item) => ({
      id: item.id,
      date: item.date,
      merchant: item.merchant,
      account: item.account,
      amount: item.amount,
      status: item.status,
    }));

    const scopedAnalytics = {
      overall: {
        ...cashflow.scopedAnalytics.overall,
        summary: {
          ...cashflow.scopedAnalytics.overall.summary,
          budgetUsedPercent: budgetBundle.budgetUsedPercent,
          budgetRemaining: budgetBundle.budgetRemaining,
          nextExpectedPaycheck: dashboardMeta.nextExpectedPaycheck,
        },
      },
      personal: {
        ...cashflow.scopedAnalytics.personal,
        summary: {
          ...cashflow.scopedAnalytics.personal.summary,
          budgetUsedPercent: 0,
          budgetRemaining: 0,
          nextExpectedPaycheck: dashboardMeta.nextExpectedPaycheck,
        },
      },
      business: {
        ...cashflow.scopedAnalytics.business,
        summary: {
          ...cashflow.scopedAnalytics.business.summary,
          budgetUsedPercent: 0,
          budgetRemaining: 0,
          nextExpectedPaycheck: dashboardMeta.nextExpectedPaycheck,
        },
      },
    } satisfies DashboardData["scopedAnalytics"];

    const financialHealth = calculateFinancialHealthScore({
      savingsRate: cashflow.savingsRate,
      incomeExpenseRatio: cashflow.incomeExpenseRatio,
      budgetUsedPercent: budgetBundle.budgetUsedPercent,
      netCashFlow: cashflow.netCashFlow,
      monthlyTrends: cashflow.monthlyTrends,
    });

    const netWorth = buildNetWorthSnapshot(linkedAccounts, cashflow.monthlyTrends);

    const data: DashboardData = {
      title: dashboardMeta.title,
      description: dashboardMeta.description,
      selectedRange: dashboardMeta.selectedRange,
      actions: dashboardMeta.actions,
      summary: {
        totalIncomeThisMonth: cashflow.totalIncomeThisMonth,
        totalExpensesThisMonth: cashflow.totalExpensesThisMonth,
        netCashFlow: cashflow.netCashFlow,
        incomeExpenseRatio: cashflow.incomeExpenseRatio,
        savingsRate: cashflow.savingsRate,
        budgetUsedPercent: budgetBundle.budgetUsedPercent,
        budgetRemaining: budgetBundle.budgetRemaining,
        nextExpectedPaycheck: dashboardMeta.nextExpectedPaycheck,
      },
      incomeVsExpenses: cashflow.incomeVsExpenses,
      monthlyTrends: cashflow.monthlyTrends,
      spendingTrends: cashflow.spendingTrends,
      budgetProgress: budgetBundle.budgetProgress,
      recentAlerts: budgetBundle.recentAlerts,
      budgetWidget: budgetBundle.budgetWidget,
      forecastVsBudget: budgetBundle.forecastVsBudget,
      recentAccountActivity,
      budgetRisk: computeBudgetRisk(budgetBundle.budgetProgress, budgetBundle.forecastVsBudget),
      linkedAccounts,
      scopedAnalytics,
      smartInsights,
      financialHealth,
      netWorth,
      mortgageRates,
      lastSyncedAt,
    };

    return withLatency(data);
  }

  async getTransactions(userId: string, query: TransactionsQuery): Promise<TransactionsData> {
    const prismaData = await getTransactionsDataFromPrisma(userId, query);
    return withLatency(prismaData);
  }

  async getTransactionById(userId: string, id: string) {
    return withLatency(await getTransactionByIdFromPrisma(userId, id));
  }

  async mutateTransaction(userId: string, payload: TransactionsMutationRequest) {
    const prismaMutated = await mutateTransactionInPrisma(userId, payload);
    if (!prismaMutated) {
      throw new Error("Transaction not found");
    }

    try {
      await recomputeSmartInsights(userId);
    } catch {
      // Keep transaction mutation successful even if insights fail to recompute.
    }

    return withLatency(prismaMutated);
  }

  getBudgets(userId: string) {
    return getBudgetsDataFromPrisma(userId);
  }
  async upsertBudget(userId: string, payload: BudgetUpsertPayload) {
    const result = await upsertBudgetInPrisma(userId, payload);

    try {
      await recomputeSmartInsights(userId);
    } catch {
      // Keep budget writes successful even if insights fail to recompute.
    }

    return result;
  }
  async deleteBudget(userId: string, id: string) {
    await deleteBudgetInPrisma(userId, id);

    try {
      await recomputeSmartInsights(userId);
    } catch {
      // Keep budget deletes successful even if insights fail to recompute.
    }
  }
  getForecastOverview(userId: string) {
    return getForecastOverviewFromPrisma(userId);
  }
  getInsights(userId: string) {
    return getInsightsDataFromPrisma(userId);
  }
  getIncome() {
    return withLatency(moduleData.income);
  }
  getWatchlist(userId: string) {
    return getWatchlistDataFromPrisma(userId);
  }
  mutateWatchlist(userId: string, payload: WatchlistMutationRequest) {
    return mutateWatchlistInPrisma(userId, payload);
  }
  getExports(userId: string) {
    return getExportsDataFromPrisma(userId);
  }
  createExport(userId: string, payload: ExportCreatePayload) {
    return createExportInPrisma(userId, payload);
  }
  getSettings() {
    return withLatency(moduleData.settings);
  }
  getBusiness() {
    return withLatency(moduleData.business);
  }
}

const service = new AppDataServiceImpl();
export function getAppDataService(): AppDataService {
  return service;
}


















