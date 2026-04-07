export type ActionButton = {
  label: string;
  variant?: "primary" | "secondary";
};

export type DataSection = {
  title: string;
  description: string;
  rows: string[];
};

export type ForecastStatus = "on_track" | "watch" | "over_budget" | "below_pace";

export type DashboardSummary = {
  totalIncomeThisMonth: number;
  totalExpensesThisMonth: number;
  netCashFlow: number;
  incomeExpenseRatio: number;
  savingsRate: number;
  budgetUsedPercent: number;
  budgetRemaining: number;
  nextExpectedPaycheck: {
    employer: string;
    date: string;
    amount: number;
  };
};

export type IncomeExpensePoint = {
  label: string;
  income: number;
  expense: number;
};

export type MonthlyTrendPoint = {
  month: string;
  income: number;
  expense: number;
  ratio: number;
  savingsRate: number;
  netCashFlow: number;
};

export type SpendingTrend = {
  category: string;
  changePct: number;
  monthlyAmount: number;
  priorAmount?: number;
};

export type BudgetProgressItem = {
  category: string;
  usedPercent: number;
};

export type AlertItem = {
  level: "info" | "watch";
  message: string;
  time: string;
};

export type DashboardBudgetWidget = {
  totalMonthlyBudget: number;
  totalSpent: number;
  totalRemaining: number;
  projectedMonthEnd: number;
  topRiskCategory: string;
  likelyOverBudgetCategories: string[];
  forecastSummary: string;
};

export type DashboardAccountActivityItem = {
  id: string;
  date: string;
  merchant: string;
  account: string;
  amount: number;
  status: TransactionStatus;
};

export type BudgetRiskItem = {
  category: string;
  usedPercent: number;
  projectedPercent: number;
  remainingAmount: number;
  riskLevel: "safe" | "watch" | "critical";
};

export type DashboardLinkedAccount = {
  id: string;
  bankConnectionId: string;
  name: string;
  institutionName?: string;
  mask?: string;
  type: string;
  subtype?: string;
  currentBalance?: number;
  availableBalance?: number;
  currencyCode: string;
  connectionStatus: "active" | "inactive" | "error";
  requiresReconnect: boolean;
  itemErrorMessage?: string;
  lastSyncedAt?: string;
};
export type ForecastVsBudgetPoint = {
  label: string;
  budget: number;
  projected: number;
  actual: number;
};

export type MortgageRatesSnapshot = {
  asOf: string;
  average30Year: number;
  average15Year: number;
  sourceLabel: string;
};

export type FinancialHealthScore = {
  score: number;
  factors: Array<{
    label: string;
    value: string;
    status: "good" | "fair" | "watch";
  }>;
  explanation: string;
};

export type FinancialHealthMetricsData = {
  score: number;
  savingsRate: number;
  expenseRatio: number;
  explanations: string[];
};


export type SmartInsightSeverity = "info" | "warning" | "alert";

export type SmartInsightType =
  | "income_expense_ratio"
  | "budget_warning"
  | "top_risk_budget"
  | "biggest_mom_spending_increase"
  | "subscription_candidate"
  | "savings_opportunity"
  | "suspicious_repeat_charge";

export type SmartInsightCard = {
  id: string;
  type: SmartInsightType;
  title: string;
  message: string;
  severity: SmartInsightSeverity;
  createdAt: string;
  dismissible: boolean;
};
export type NetWorthTrendPoint = {
  label: string;
  assets: number;
  liabilities: number;
  netWorth: number;
};

export type NetWorthSnapshot = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  manualAssetsPlaceholder: number;
  manualLiabilitiesPlaceholder: number;
  trend: NetWorthTrendPoint[];
};
export type DashboardScope = "overall" | "personal" | "business";

export type ScopedDashboardAnalytics = {
  summary: DashboardSummary;
  monthlyTrends: MonthlyTrendPoint[];
  insights: string[];
};

export type DashboardData = {
  title: string;
  description: string;
  selectedRange: string;
  actions: ActionButton[];
  summary: DashboardSummary;
  incomeVsExpenses: IncomeExpensePoint[];
  monthlyTrends: MonthlyTrendPoint[];
  spendingTrends: SpendingTrend[];
  budgetProgress: BudgetProgressItem[];
  recentAlerts: AlertItem[];
  budgetWidget: DashboardBudgetWidget;
  forecastVsBudget: ForecastVsBudgetPoint[];
  recentAccountActivity: DashboardAccountActivityItem[];
  budgetRisk: BudgetRiskItem[];
  linkedAccounts: DashboardLinkedAccount[];
  scopedAnalytics: Record<DashboardScope, ScopedDashboardAnalytics>;
  smartInsights: SmartInsightCard[];
  financialHealth: FinancialHealthScore;
  netWorth: NetWorthSnapshot;
  mortgageRates: MortgageRatesSnapshot;
  lastSyncedAt?: string;
};

export type ModuleData = {
  title: string;
  description: string;
  selectedRange: string;
  actions: ActionButton[];
  sections: DataSection[];
};

export type TransactionPurpose = "personal" | "business" | "split" | "uncertain";
export type TransactionStatus = "pending" | "posted";
export type ReviewStatus = "unreviewed" | "reviewed";
export type SplitMethod = "percentage" | "amount";
export type TransactionSource = "plaid" | "statement_pdf" | "manual";

export type ExpenseTag =
  | "vacation"
  | "holiday"
  | "medical"
  | "home repair"
  | "wedding"
  | "one-time event"
  | "business trip";

export type TransactionSplit = {
  method: SplitMethod;
  personalAmount: number;
  businessAmount: number;
  personalPercent?: number;
  businessPercent?: number;
};

export type TransactionRecord = {
  id: string;
  date: string;
  merchant: string;
  description: string;
  category: string;
  account: string;
  amount: number;
  source: TransactionSource;
  purpose: TransactionPurpose;
  status: TransactionStatus;
  reviewStatus: ReviewStatus;
  isSuspicious: boolean;
  notes: string[];
  expenseTags: ExpenseTag[];
  customTags: string[];
  split?: TransactionSplit;
};

export type TransactionsFilters = {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  merchant?: string;
  category?: string;
  account?: string;
  purpose?: TransactionPurpose;
  status?: TransactionStatus;
  amountMin?: number;
  amountMax?: number;
};

export type TransactionsQuery = TransactionsFilters & {
  page: number;
  pageSize: number;
};

export type TransactionsFilterOptions = {
  merchants: string[];
  categories: string[];
  accounts: string[];
  purposes: TransactionPurpose[];
  statuses: TransactionStatus[];
};

export type TransactionsData = {
  title: string;
  description: string;
  selectedRange: string;
  actions: ActionButton[];
  query: TransactionsQuery;
  totalCount: number;
  totalPages: number;
  items: TransactionRecord[];
  filterOptions: TransactionsFilterOptions;
};

export type TransactionsMutationRequest =
  | { action: "updateCategory"; id: string; category: string }
  | { action: "updatePurpose"; id: string; purpose: TransactionPurpose }
  | { action: "split"; id: string; split: TransactionSplit }
  | { action: "flagSuspicious"; id: string; isSuspicious: boolean }
  | { action: "addNote"; id: string; note: string }
  | { action: "setExpenseTags"; id: string; tags: ExpenseTag[] }
  | { action: "setCustomTags"; id: string; tags: string[] }
  | { action: "markReviewed"; id: string; reviewStatus: ReviewStatus };

export type TransactionsMutationResponse = {
  transaction: TransactionRecord;
};

export type BudgetAlertType = "threshold_80" | "threshold_100" | "projected_over_budget";

export type BudgetAlert = {
  id: string;
  category: string;
  type: BudgetAlertType;
  message: string;
  createdAt: string;
};

export type BudgetCategorySnapshot = {
  id: string;
  category: string;
  budgetAmount: number;
  actualSpent: number;
  pendingSpent: number;
  remainingAmount: number;
  percentUsed: number;
  forecastedSpend: number;
  status: ForecastStatus;
  explanation: string;
};

export type BudgetSummary = {
  monthLabel: string;
  totalBudget: number;
  totalActual: number;
  totalPending: number;
  totalRemaining: number;
  totalProjected: number;
  topRiskCategory: string;
};

export type ForecastSnapshot = {
  category: string;
  budgetTarget: number;
  actualSpent: number;
  projectedSpent: number;
  status: ForecastStatus;
  explanation: string;
};

export type ForecastOverviewData = {
  periodLabel: string;
  totalBudget: number;
  totalActual: number;
  totalProjected: number;
  summaries: string[];
  snapshots: ForecastSnapshot[];
};

export type BudgetsData = {
  title: string;
  description: string;
  selectedRange: string;
  actions: ActionButton[];
  summary: BudgetSummary;
  categories: BudgetCategorySnapshot[];
  alerts: BudgetAlert[];
  recentAlerts: BudgetAlert[];
};

export type BudgetUpsertPayload = {
  id?: string;
  category: string;
  budgetAmount: number;
  actualSpent: number;
  pendingSpent: number;
};

export type BudgetUpsertResponse = {
  budget: BudgetCategorySnapshot;
};

export type RecurringChargeItem = {
  merchant: string;
  estimatedFrequency: "weekly" | "biweekly" | "monthly" | "irregular";
  estimatedMonthlyCost: number;
  recentChargeCount: number;
};
export type TripCategoryBreakdown = {
  category: string;
  amount: number;
};

export type TripTransactionItem = {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
};

export type TripSummary = {
  id: string;
  tripLabel: string;
  tripType: "vacation" | "holiday" | "business trip";
  startDate: string;
  endDate: string;
  totalTripCost: number;
  days: number;
  travelers: number;
  costPerDay: number;
  costPerTraveler: number;
  categoryBreakdown: TripCategoryBreakdown[];
  transactions: TripTransactionItem[];
};

export type TripProjection = {
  priorTripTotal: number;
  priorTripCostPerDay: number;
  expectedTotal: number;
  lowEstimate: number;
  highEstimate: number;
  expectedCostPerDay: number;
  expectedCostPerTraveler: number;
  baseCostPerTravelerDay: number;
  baselineAverageTripCost: number;
  assumptions: string[];
};

export type InsightsData = {
  title: string;
  description: string;
  selectedRange: string;
  actions: ActionButton[];
  smartInsights: SmartInsightCard[];
  recurringCharges: RecurringChargeItem[];
  recurringChargesSummary: string;
  tripSummaries: TripSummary[];
  projectionDefaults: {
    days: number;
    travelers: number;
  };
  projectionBaseline: TripProjection;
  mortgageRates: MortgageRatesSnapshot;
  lastSyncedAt?: string;
};

export type WatchMatchStatus = "new" | "acknowledged" | "dismissed";
export type WatchMatchType = "exact" | "fuzzy";

export type WatchRuleItem = {
  id: string;
  merchantPattern: string;
  amountMin?: number;
  amountMax?: number;
  matchType: WatchMatchType;
  note?: string;
  isActive: boolean;
  createdAt: string;
};

export type WatchMatchItem = {
  id: string;
  watchRuleId: string;
  watchRuleLabel: string;
  merchant: string;
  amount: number;
  date: string;
  status: WatchMatchStatus;
  merchantNote?: string;
  similarityScore?: number;
  transactionId: string;
};

export type WatchCandidateTransaction = {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  category: string;
};

export type WatchlistData = {
  title: string;
  description: string;
  selectedRange: string;
  actions: ActionButton[];
  activeRules: WatchRuleItem[];
  recentMatches: WatchMatchItem[];
  suspiciousCandidates: WatchCandidateTransaction[];
};

export type WatchlistMutationRequest =
  | {
      action: "createFromTransaction";
      transactionId: string;
      matchType?: WatchMatchType;
      amountTolerancePct?: number;
      note?: string;
    }
  | {
      action: "createRule";
      merchantPattern: string;
      amountMin?: number;
      amountMax?: number;
      matchType: WatchMatchType;
      note?: string;
    }
  | {
      action: "updateRule";
      ruleId: string;
      merchantPattern?: string;
      amountMin?: number;
      amountMax?: number;
      matchType?: WatchMatchType;
      note?: string;
      isActive?: boolean;
    }
  | {
      action: "setMatchStatus";
      matchId: string;
      status: "acknowledged" | "dismissed";
    }
  | {
      action: "escalateMatch";
      matchId: string;
      reason?: string;
    };

export type WatchlistMutationResponse = {
  ok: boolean;
};

export type ExportFormat = "csv" | "xlsx" | "pdf";
export type ExportMode = "summary_only" | "itemized_only" | "summary_and_itemized";
export type ExportScope = "all" | "personal_only" | "business_only" | "trip_tagged";

export type ExportTransactionRow = {
  id: string;
  date: string;
  merchant: string;
  category: string;
  purpose: TransactionPurpose;
  amount: number;
};

export type ExportRollupItem = {
  key: string;
  amount: number;
  count: number;
};

export type ExportPreview = {
  summaryTotal: number;
  itemizedTotal: number;
  reconciled: boolean;
  rowCount: number;
  categoryRollups: ExportRollupItem[];
  merchantRollups: ExportRollupItem[];
  monthlyRollups: ExportRollupItem[];
  itemized: ExportTransactionRow[];
};

export type ExportRunItem = {
  id: string;
  format: ExportFormat;
  mode: ExportMode;
  scope: ExportScope;
  status: "queued" | "processing" | "completed" | "failed";
  rowCount?: number;
  totalAmount?: number;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  downloadUrl?: string;
};

export type ExportsData = {
  title: string;
  description: string;
  selectedRange: string;
  actions: ActionButton[];
  recentRuns: ExportRunItem[];
};

export type ExportCreatePayload = {
  format: ExportFormat;
  mode: ExportMode;
  scope: ExportScope;
  dateFrom?: string;
  dateTo?: string;
};

export type ExportCreateResponse = {
  run: ExportRunItem;
  preview: ExportPreview;
};

export type IncomeData = ModuleData;
export type SettingsData = ModuleData;
export type BusinessData = ModuleData;

export type StatementImportEntryPreview = {
  id: string;
  date?: string;
  description: string;
  merchant?: string;
  amount: number;
  direction?: "debit" | "credit";
  confidence: number;
  duplicateTransactionId?: string;
  duplicateReason?: string;
  selectedForImport: boolean;
};

export type StatementImportPreview = {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  accountLabel?: string;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
  parserStatus: "parsed" | "needs_review" | "failed" | "imported" | "cancelled";
  parserMessage?: string;
  parserConfidence: number;
  detectedTransactionCount: number;
  importedTransactionCount: number;
  createdAt: string;
  importedAt?: string;
  transactions: StatementImportEntryPreview[];
};

export type StatementImportHistoryItem = {
  id: string;
  filename: string;
  uploadedAt: string;
  statementPeriodLabel: string;
  importedTransactionCount: number;
  parserStatus: "parsed" | "needs_review" | "failed" | "imported" | "cancelled";
  accountLabel?: string;
};

export type StatementImportUploadResponse = {
  importPreview: StatementImportPreview;
};

export type StatementImportFinalizeResponse = {
  importPreview: StatementImportPreview;
  importedCount: number;
};

export type StatementImportHistoryResponse = {
  items: StatementImportHistoryItem[];
};

export type AppApiError = {
  error: string;
};











