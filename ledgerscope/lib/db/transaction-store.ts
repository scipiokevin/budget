import { prisma } from "@/lib/db/prisma";
import type {
  DashboardLinkedAccount,
  DashboardSummary,
  ExpenseTag,
  MonthlyTrendPoint,
  ReviewStatus as UiReviewStatus,
  SpendingTrend,
  TransactionPurpose,
  TransactionRecord,
  TransactionsData,
  TransactionsFilterOptions,
  TransactionsMutationRequest,
  TransactionsMutationResponse,
  TransactionsQuery,
} from "@/types/contracts";

const TAG_PREFIX = "TAG:";
const CUSTOM_TAG_PREFIX = "CUSTOM_TAG:";
const ALLOWED_TAGS: ExpenseTag[] = [
  "vacation",
  "holiday",
  "medical",
  "home repair",
  "wedding",
  "one-time event",
  "business trip",
];

type DecimalLike = { toString(): string };
type PrismaCashFlowType =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER"
  | "REFUND"
  | "REIMBURSEMENT"
  | "ADJUSTMENT";
type PrismaReviewStatus = "UNREVIEWED" | "REVIEWED" | "NEEDS_REVIEW";
type PrismaTransactionPurpose = "PERSONAL" | "BUSINESS" | "SPLIT" | "UNCERTAIN";
type PrismaTransactionStatus = "PENDING" | "POSTED" | "REMOVED";

type StringFilter = {
  equals?: string;
  contains?: string;
  mode?: "insensitive";
};

type TransactionWhere = {
  userId: string;
  status: { not: PrismaTransactionStatus } | PrismaTransactionStatus;
  OR?: Array<{
    merchantRaw?: StringFilter;
    merchantNormalized?: StringFilter;
    description?: StringFilter;
  }>;
  date?: { gte?: Date; lte?: Date };
  merchantRaw?: StringFilter;
  categoryPrimary?: StringFilter;
  bankAccount?: { name: StringFilter };
  purpose?: PrismaTransactionPurpose;
  amount?: { gte?: number; lte?: number };
};

type TransactionDbRow = {
  id: string;
  date: Date;
  merchantRaw: string | null;
  merchantNormalized: string | null;
  description: string | null;
  categoryPrimary: string | null;
  amount: DecimalLike;
  purpose: PrismaTransactionPurpose;
  status: PrismaTransactionStatus;
  reviewStatus: PrismaReviewStatus;
  isSuspicious: boolean;
  bankAccount: { name: string } | null;
  notes: { note: string }[];
  splits: {
    splitMethod: string;
    personalAmount: DecimalLike;
    businessAmount: DecimalLike;
    personalPercent: DecimalLike | null;
    businessPercent: DecimalLike | null;
  }[];
};

type ScopeTransactionRow = {
  date: Date;
  amount: DecimalLike;
  cashFlowType: PrismaCashFlowType;
  categoryPrimary: string | null;
  purpose: PrismaTransactionPurpose;
};

type SummaryRow = {
  amount: DecimalLike;
  cashFlowType: PrismaCashFlowType;
};

type MonthlyAggregate = {
  income: number;
  expense: number;
};

type WeeklyCashflowPoint = {
  label: string;
  income: number;
  expense: number;
};

const CASH_FLOW_TYPE = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
} as const satisfies Record<"INCOME" | "EXPENSE", PrismaCashFlowType>;

const REVIEW_STATUS = {
  REVIEWED: "REVIEWED",
  UNREVIEWED: "UNREVIEWED",
} as const satisfies Record<"REVIEWED" | "UNREVIEWED", PrismaReviewStatus>;

const TRANSACTION_PURPOSE = {
  PERSONAL: "PERSONAL",
  BUSINESS: "BUSINESS",
  SPLIT: "SPLIT",
  UNCERTAIN: "UNCERTAIN",
} as const satisfies Record<"PERSONAL" | "BUSINESS" | "SPLIT" | "UNCERTAIN", PrismaTransactionPurpose>;

const TRANSACTION_STATUS = {
  PENDING: "PENDING",
  POSTED: "POSTED",
  REMOVED: "REMOVED",
} as const satisfies Record<"PENDING" | "POSTED" | "REMOVED", PrismaTransactionStatus>;

function toNumber(value: DecimalLike | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function normalizeTag(tag: string): ExpenseTag | null {
  const lowered = tag.trim().toLowerCase();
  return ALLOWED_TAGS.find((allowed) => allowed === lowered) ?? null;
}

function noteToTag(note: string): ExpenseTag | null {
  if (!note.startsWith(TAG_PREFIX)) return null;
  return normalizeTag(note.slice(TAG_PREFIX.length));
}

function extractTags(notes: { note: string }[]): ExpenseTag[] {
  const tags = notes
    .map((n) => noteToTag(n.note))
    .filter((value): value is ExpenseTag => Boolean(value));
  return [...new Set(tags)];
}

function extractCustomTags(notes: { note: string }[]): string[] {
  const tags = notes
    .map((n) => n.note)
    .filter((note) => note.startsWith(CUSTOM_TAG_PREFIX))
    .map((note) => note.slice(CUSTOM_TAG_PREFIX.length).trim())
    .filter((tag) => tag.length > 0);

  return [...new Set(tags)];
}

function mapPurposeFromPrisma(value: PrismaTransactionPurpose): TransactionPurpose {
  switch (value) {
    case TRANSACTION_PURPOSE.PERSONAL:
      return "personal";
    case TRANSACTION_PURPOSE.BUSINESS:
      return "business";
    case TRANSACTION_PURPOSE.SPLIT:
      return "split";
    default:
      return "uncertain";
  }
}

function mapPurposeToPrisma(value: TransactionPurpose): PrismaTransactionPurpose {
  switch (value) {
    case "personal":
      return TRANSACTION_PURPOSE.PERSONAL;
    case "business":
      return TRANSACTION_PURPOSE.BUSINESS;
    case "split":
      return TRANSACTION_PURPOSE.SPLIT;
    default:
      return TRANSACTION_PURPOSE.UNCERTAIN;
  }
}

function mapStatusFromPrisma(value: PrismaTransactionStatus): "pending" | "posted" {
  return value === TRANSACTION_STATUS.PENDING ? "pending" : "posted";
}

function mapReviewFromPrisma(value: PrismaReviewStatus): UiReviewStatus {
  return value === REVIEW_STATUS.REVIEWED ? "reviewed" : "unreviewed";
}

function mapReviewToPrisma(value: UiReviewStatus): PrismaReviewStatus {
  return value === "reviewed" ? REVIEW_STATUS.REVIEWED : REVIEW_STATUS.UNREVIEWED;
}

function mapTransactionRecord(tx: TransactionDbRow): TransactionRecord {
  const split = tx.splits[0];
  const tags = extractTags(tx.notes);
  const customTags = extractCustomTags(tx.notes);

  return {
    id: tx.id,
    date: tx.date.toISOString().slice(0, 10),
    merchant: tx.merchantRaw ?? tx.merchantNormalized ?? "Unknown merchant",
    description: tx.description ?? tx.merchantRaw ?? "",
    category: tx.categoryPrimary ?? "Uncategorized",
    account: tx.bankAccount?.name ?? "Connected account",
    amount: toNumber(tx.amount),
    purpose: mapPurposeFromPrisma(tx.purpose),
    status: mapStatusFromPrisma(tx.status),
    reviewStatus: mapReviewFromPrisma(tx.reviewStatus),
    isSuspicious: tx.isSuspicious,
    notes: tx.notes
      .map((note) => note.note)
      .filter((note) => !note.startsWith(TAG_PREFIX) && !note.startsWith(CUSTOM_TAG_PREFIX)),
    expenseTags: tags,
    customTags,
    split: split
      ? {
          method: split.splitMethod === "percentage" ? "percentage" : "amount",
          personalAmount: toNumber(split.personalAmount),
          businessAmount: toNumber(split.businessAmount),
          personalPercent: split.personalPercent ? toNumber(split.personalPercent) : undefined,
          businessPercent: split.businessPercent ? toNumber(split.businessPercent) : undefined,
        }
      : undefined,
  };
}

function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
}

function endOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));
}

function buildWhere(userId: string, query: TransactionsQuery): TransactionWhere {
  const where: TransactionWhere = {
    userId,
    status: { not: TRANSACTION_STATUS.REMOVED },
  };

  if (query.search) {
    where.OR = [
      { merchantRaw: { contains: query.search, mode: "insensitive" } },
      { merchantNormalized: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }

  if (query.dateFrom || query.dateTo) {
    where.date = {};
    if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
    if (query.dateTo) where.date.lte = new Date(query.dateTo);
  }

  if (query.merchant) {
    where.merchantRaw = { equals: query.merchant, mode: "insensitive" };
  }

  if (query.category) {
    where.categoryPrimary = { equals: query.category, mode: "insensitive" };
  }

  if (query.account) {
    where.bankAccount = { name: { equals: query.account, mode: "insensitive" } };
  }

  if (query.purpose) {
    where.purpose = mapPurposeToPrisma(query.purpose);
  }

  if (query.status) {
    where.status = query.status === "pending" ? TRANSACTION_STATUS.PENDING : TRANSACTION_STATUS.POSTED;
  }

  if (typeof query.amountMin === "number" || typeof query.amountMax === "number") {
    where.amount = {};
    if (typeof query.amountMin === "number") where.amount.gte = query.amountMin;
    if (typeof query.amountMax === "number") where.amount.lte = query.amountMax;
  }

  return where;
}

async function loadFilterOptions(userId: string): Promise<TransactionsFilterOptions> {
  const rows = await prisma.transaction.findMany({
    where: { userId, status: { not: TRANSACTION_STATUS.REMOVED } },
    select: {
      merchantRaw: true,
      categoryPrimary: true,
      bankAccount: { select: { name: true } },
    },
    take: 1000,
    orderBy: { date: "desc" },
  });

  return {
    merchants: [...new Set(rows.map((row) => row.merchantRaw).filter((x): x is string => Boolean(x)))].sort(),
    categories: [...new Set(rows.map((row) => row.categoryPrimary).filter((x): x is string => Boolean(x)))].sort(),
    accounts: [...new Set(rows.map((row) => row.bankAccount?.name).filter((x): x is string => Boolean(x)))].sort(),
    purposes: ["personal", "business", "split", "uncertain"],
    statuses: ["posted", "pending"],
  };
}

export async function getTransactionsDataFromPrisma(userId: string, query: TransactionsQuery): Promise<TransactionsData> {
  const where = buildWhere(userId, query);
  const totalCount = await prisma.transaction.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);

  const rows = await prisma.transaction.findMany({
    where,
    include: {
      bankAccount: { select: { name: true } },
      notes: { orderBy: { createdAt: "asc" }, select: { note: true } },
      splits: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          splitMethod: true,
          personalAmount: true,
          businessAmount: true,
          personalPercent: true,
          businessPercent: true,
        },
      },
    },
    orderBy: { date: "desc" },
    skip: (page - 1) * query.pageSize,
    take: query.pageSize,
  });

  const filterOptions = await loadFilterOptions(userId);

  return {
    title: "Transactions",
    description: "Search, filter, review, and classify account activity.",
    selectedRange: "Custom",
    actions: [
      { label: "Sync Now", variant: "primary" },
      { label: "Export", variant: "secondary" },
    ],
    query: { ...query, page },
    totalCount,
    totalPages,
    items: rows.map(mapTransactionRecord),
    filterOptions,
  };
}

export async function getTransactionByIdFromPrisma(userId: string, id: string): Promise<TransactionRecord | null> {
  const tx = await prisma.transaction.findFirst({
    where: { id, userId, status: { not: TRANSACTION_STATUS.REMOVED } },
    include: {
      bankAccount: { select: { name: true } },
      notes: { orderBy: { createdAt: "asc" }, select: { note: true } },
      splits: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          splitMethod: true,
          personalAmount: true,
          businessAmount: true,
          personalPercent: true,
          businessPercent: true,
        },
      },
    },
  });

  return tx ? mapTransactionRecord(tx) : null;
}

export async function mutateTransactionInPrisma(userId: string, payload: TransactionsMutationRequest): Promise<TransactionsMutationResponse | null> {
  const tx = await prisma.transaction.findFirst({ where: { id: payload.id, userId } });
  if (!tx) return null;

  switch (payload.action) {
    case "updateCategory":
      await prisma.transaction.update({ where: { id: payload.id }, data: { categoryPrimary: payload.category } });
      break;
    case "updatePurpose":
      await prisma.transaction.update({ where: { id: payload.id }, data: { purpose: mapPurposeToPrisma(payload.purpose) } });
      break;
    case "split":
      await prisma.transaction.update({ where: { id: payload.id }, data: { purpose: TRANSACTION_PURPOSE.SPLIT } });
      await prisma.transactionSplit.deleteMany({ where: { transactionId: payload.id } });
      await prisma.transactionSplit.create({
        data: {
          transactionId: payload.id,
          splitMethod: payload.split.method,
          personalAmount: payload.split.personalAmount,
          businessAmount: payload.split.businessAmount,
          personalPercent: payload.split.personalPercent,
          businessPercent: payload.split.businessPercent,
        },
      });
      break;
    case "flagSuspicious":
      await prisma.transaction.update({ where: { id: payload.id }, data: { isSuspicious: payload.isSuspicious } });
      break;
    case "addNote":
      await prisma.transactionNote.create({ data: { transactionId: payload.id, userId, note: payload.note } });
      break;
    case "setExpenseTags": {
      await prisma.transactionNote.deleteMany({ where: { transactionId: payload.id, userId, note: { startsWith: TAG_PREFIX } } });
      const normalized = [...new Set(payload.tags.map((tag) => normalizeTag(tag)).filter((x): x is ExpenseTag => Boolean(x)))];
      if (normalized.length > 0) {
        await prisma.transactionNote.createMany({
          data: normalized.map((tag) => ({ transactionId: payload.id, userId, note: `${TAG_PREFIX}${tag}` })),
        });
      }
      break;
    }
    case "setCustomTags": {
      await prisma.transactionNote.deleteMany({ where: { transactionId: payload.id, userId, note: { startsWith: CUSTOM_TAG_PREFIX } } });
      const normalized = [...new Set(payload.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
      if (normalized.length > 0) {
        await prisma.transactionNote.createMany({
          data: normalized.map((tag) => ({ transactionId: payload.id, userId, note: `${CUSTOM_TAG_PREFIX}${tag}` })),
        });
      }
      break;
    }
    case "markReviewed":
      await prisma.transaction.update({ where: { id: payload.id }, data: { reviewStatus: mapReviewToPrisma(payload.reviewStatus) } });
      break;
    default:
      break;
  }

  const latest = await getTransactionByIdFromPrisma(userId, payload.id);
  return latest ? { transaction: latest } : null;
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export async function getLatestSyncTimestampFromPrisma(userId: string): Promise<string | undefined> {
  const latest = await prisma.bankConnection.findFirst({
    where: {
      userId,
      lastSyncedAt: { not: null },
    },
    orderBy: { lastSyncedAt: "desc" },
    select: { lastSyncedAt: true },
  });

  return latest?.lastSyncedAt?.toISOString();
}
export async function getLinkedAccountsFromPrisma(userId: string): Promise<DashboardLinkedAccount[]> {
  const accounts = await prisma.bankAccount.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      mask: true,
      type: true,
      subtype: true,
      currentBalance: true,
      availableBalance: true,
      currencyCode: true,
    },
  });

  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    mask: account.mask ?? undefined,
    type: account.type,
    subtype: account.subtype ?? undefined,
    currentBalance: account.currentBalance ? toNumber(account.currentBalance) : undefined,
    availableBalance: account.availableBalance ? toNumber(account.availableBalance) : undefined,
    currencyCode: account.currencyCode,
  }));
}

type ScopeKey = "overall" | "personal" | "business";

function rowsForScope(
  rows: ScopeTransactionRow[],
  scope: ScopeKey,
) {
  if (scope === "overall") return rows;
  if (scope === "personal") return rows.filter((row) => row.purpose === TRANSACTION_PURPOSE.PERSONAL);
  return rows.filter((row) => row.purpose === TRANSACTION_PURPOSE.BUSINESS);
}

function buildSummaryFromRows(
  rows: SummaryRow[],
  budgetUsedPercent: number,
  budgetRemaining: number,
): DashboardSummary {
  const totalIncomeThisMonth = rows
    .filter((row) => row.cashFlowType === CASH_FLOW_TYPE.INCOME)
    .reduce((sum, row) => sum + toNumber(row.amount), 0);
  const totalExpensesThisMonth = rows
    .filter((row) => row.cashFlowType === CASH_FLOW_TYPE.EXPENSE)
    .reduce((sum, row) => sum + toNumber(row.amount), 0);
  const netCashFlow = totalIncomeThisMonth - totalExpensesThisMonth;

  return {
    totalIncomeThisMonth,
    totalExpensesThisMonth,
    netCashFlow,
    incomeExpenseRatio:
      totalExpensesThisMonth > 0 ? Number((totalIncomeThisMonth / totalExpensesThisMonth).toFixed(2)) : 0,
    savingsRate:
      totalIncomeThisMonth > 0
        ? Number(((netCashFlow / totalIncomeThisMonth) * 100).toFixed(1))
        : 0,
    budgetUsedPercent,
    budgetRemaining,
    nextExpectedPaycheck: {
      employer: "Northline Logistics",
      date: "Mar 13, 2026",
      amount: 2350,
    },
  };
}

function buildMonthlyTrends(
  rows: ScopeTransactionRow[],
): MonthlyTrendPoint[] {
  const grouped = new Map<string, MonthlyAggregate>();

  for (const tx of rows) {
    const key = monthKey(tx.date);
    const current: MonthlyAggregate = grouped.get(key) ?? { income: 0, expense: 0 };
    if (tx.cashFlowType === CASH_FLOW_TYPE.INCOME) current.income += toNumber(tx.amount);
    if (tx.cashFlowType === CASH_FLOW_TYPE.EXPENSE) current.expense += toNumber(tx.amount);
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-6)
    .map(([key, value]) => {
      const net = value.income - value.expense;
      return {
        month: monthLabelFromKey(key),
        income: Number(value.income.toFixed(2)),
        expense: Number(value.expense.toFixed(2)),
        ratio: value.expense > 0 ? Number((value.income / value.expense).toFixed(2)) : 0,
        savingsRate: value.income > 0 ? Number(((net / value.income) * 100).toFixed(1)) : 0,
        netCashFlow: Number(net.toFixed(2)),
      };
    });
}

function buildNarrativeInsights(summary: DashboardSummary, trends: MonthlyTrendPoint[]): string[] {
  const expensePct =
    summary.totalIncomeThisMonth > 0
      ? Number(((summary.totalExpensesThisMonth / summary.totalIncomeThisMonth) * 100).toFixed(1))
      : 0;

  const first = `Expenses are ${expensePct}% of income this month.`;

  if (trends.length < 2) {
    return [first, "Income-to-expense ratio trend needs at least two months of data."];
  }

  const current = trends[trends.length - 1];
  const previous = trends[trends.length - 2];

  const second =
    current.ratio > previous.ratio
      ? `Income-to-expense ratio improved versus last month (${current.ratio.toFixed(2)}x vs ${previous.ratio.toFixed(2)}x).`
      : current.ratio < previous.ratio
        ? `Income-to-expense ratio declined versus last month (${current.ratio.toFixed(2)}x vs ${previous.ratio.toFixed(2)}x).`
        : `Income-to-expense ratio is unchanged versus last month (${current.ratio.toFixed(2)}x).`;

  return [first, second];
}

export async function getDashboardCashflowSnapshot(userId: string): Promise<{
  totalIncomeThisMonth: number;
  totalExpensesThisMonth: number;
  netCashFlow: number;
  incomeExpenseRatio: number;
  savingsRate: number;
  incomeVsExpenses: Array<{ label: string; income: number; expense: number }>;
  monthlyTrends: MonthlyTrendPoint[];
  spendingTrends: SpendingTrend[];
  scopedAnalytics: Record<
    ScopeKey,
    {
      summary: DashboardSummary;
      monthlyTrends: MonthlyTrendPoint[];
      insights: string[];
    }
  >;
}> {
  const from = startOfMonth();
  const to = endOfMonth();
  const previousFrom = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1, 0, 0, 0));
  const previousTo = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 0, 23, 59, 59));

  const txs: ScopeTransactionRow[] = await prisma.transaction.findMany({
    where: {
      userId,
      status: { not: TRANSACTION_STATUS.REMOVED },
      date: { gte: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 5, 1)), lte: to },
    },
    select: {
      date: true,
      amount: true,
      cashFlowType: true,
      categoryPrimary: true,
      purpose: true,
    },
  });

  const thisMonth = txs.filter((tx) => tx.date >= from && tx.date <= to);
  const previousMonth = txs.filter((tx) => tx.date >= previousFrom && tx.date <= previousTo);
  const overallSummary = buildSummaryFromRows(thisMonth, 0, 0);

  const incomeVsExpenses: WeeklyCashflowPoint[] = Array.from({ length: 4 }, (_, index) => ({
    label: `Week ${index + 1}`,
    income: 0,
    expense: 0,
  }));
  for (const tx of thisMonth) {
    const day = tx.date.getUTCDate();
    const weekIndex = Math.min(3, Math.floor((day - 1) / 7));
    if (tx.cashFlowType === CASH_FLOW_TYPE.INCOME) incomeVsExpenses[weekIndex].income += toNumber(tx.amount);
    if (tx.cashFlowType === CASH_FLOW_TYPE.EXPENSE) incomeVsExpenses[weekIndex].expense += toNumber(tx.amount);
  }

  const monthlyTrends = buildMonthlyTrends(txs);

  const expenseByCategory = new Map<string, number>();
  const previousExpenseByCategory = new Map<string, number>();
  for (const tx of thisMonth) {
    if (tx.cashFlowType !== CASH_FLOW_TYPE.EXPENSE) continue;
    const category = tx.categoryPrimary ?? "Uncategorized";
    expenseByCategory.set(category, (expenseByCategory.get(category) ?? 0) + toNumber(tx.amount));
  }
  for (const tx of previousMonth) {
    if (tx.cashFlowType !== CASH_FLOW_TYPE.EXPENSE) continue;
    const category = tx.categoryPrimary ?? "Uncategorized";
    previousExpenseByCategory.set(category, (previousExpenseByCategory.get(category) ?? 0) + toNumber(tx.amount));
  }

  const spendingTrends: SpendingTrend[] = [...expenseByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, monthlyAmount]) => {
      const priorAmount = Number((previousExpenseByCategory.get(category) ?? 0).toFixed(2));
      const changePct =
        priorAmount > 0 ? Number((((monthlyAmount - priorAmount) / priorAmount) * 100).toFixed(1)) : monthlyAmount > 0 ? 100 : 0;

      return {
        category,
        monthlyAmount: Number(monthlyAmount.toFixed(2)),
        priorAmount,
        changePct,
      };
    });

  const scopedAnalytics = ([
    "overall",
    "personal",
    "business",
  ] as ScopeKey[]).reduce(
    (acc, scope) => {
      const scopedRows = rowsForScope(txs, scope);
      const scopedMonthRows = scopedRows.filter((row) => row.date >= from && row.date <= to);
      const summary = buildSummaryFromRows(scopedMonthRows, 0, 0);
      const scopedTrends = buildMonthlyTrends(scopedRows);

      acc[scope] = {
        summary,
        monthlyTrends: scopedTrends,
        insights: buildNarrativeInsights(summary, scopedTrends),
      };

      return acc;
    },
    {} as Record<ScopeKey, { summary: DashboardSummary; monthlyTrends: MonthlyTrendPoint[]; insights: string[] }>,
  );

  return {
    totalIncomeThisMonth: overallSummary.totalIncomeThisMonth,
    totalExpensesThisMonth: overallSummary.totalExpensesThisMonth,
    netCashFlow: overallSummary.netCashFlow,
    incomeExpenseRatio: overallSummary.incomeExpenseRatio,
    savingsRate: overallSummary.savingsRate,
    incomeVsExpenses,
    monthlyTrends,
    spendingTrends,
    scopedAnalytics,
  };
}



