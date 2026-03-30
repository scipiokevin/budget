import { getBudgetsDataFromPrisma } from "@/lib/db/budget-forecast-store";
import { prisma } from "@/lib/db/prisma";
import type { SmartInsightCard, SmartInsightSeverity, SmartInsightType } from "@/types/contracts";

const SMART_PREFIX = "smart_";

type GeneratedInsight = {
  type: SmartInsightType;
  title: string;
  message: string;
  severity: SmartInsightSeverity;
  metricValue?: number;
};

type DecimalLike = { toString(): string };
type PrismaCashFlowType =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER"
  | "REFUND"
  | "REIMBURSEMENT"
  | "ADJUSTMENT";
type PrismaTransactionStatus = "PENDING" | "POSTED" | "REMOVED";

const CASH_FLOW_TYPE = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
} as const satisfies Record<"INCOME" | "EXPENSE", PrismaCashFlowType>;

const TRANSACTION_STATUS = {
  REMOVED: "REMOVED",
} as const satisfies Record<"REMOVED", PrismaTransactionStatus>;

function toNumber(value: DecimalLike | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
}

function endOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));
}

function startOfPreviousMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1, 0, 0, 0));
}

function endOfPreviousMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0, 23, 59, 59));
}

function toInsightType(insightType: string): SmartInsightType | null {
  const parsed = insightType.startsWith(SMART_PREFIX) ? insightType.slice(SMART_PREFIX.length) : insightType;
  if (
    parsed === "income_expense_ratio" ||
    parsed === "budget_warning" ||
    parsed === "top_risk_budget" ||
    parsed === "biggest_mom_spending_increase" ||
    parsed === "subscription_candidate" ||
    parsed === "savings_opportunity" ||
    parsed === "suspicious_repeat_charge"
  ) {
    return parsed;
  }

  return null;
}

function toSeverity(value: string | null | undefined): SmartInsightSeverity {
  if (value === "warning" || value === "alert") return value;
  return "info";
}

function mapStoredInsight(row: {
  id: string;
  insightType: string;
  title: string;
  body: string;
  trendDirection: string | null;
  createdAt: Date;
}): SmartInsightCard | null {
  const type = toInsightType(row.insightType);
  if (!type) return null;

  return {
    id: row.id,
    type,
    title: row.title,
    message: row.body,
    severity: toSeverity(row.trendDirection),
    createdAt: row.createdAt.toISOString(),
    dismissible: true,
  };
}

function buildRatioInsight(totalIncome: number, totalExpense: number): GeneratedInsight {
  const ratio = totalExpense > 0 ? Number((totalIncome / totalExpense).toFixed(2)) : 0;

  if (ratio < 1) {
    return {
      type: "income_expense_ratio",
      title: "Income vs expense ratio",
      message: `Your income-to-expense ratio is ${ratio}x this month. Expenses are currently outpacing income.`,
      severity: "alert",
      metricValue: ratio,
    };
  }

  if (ratio < 1.2) {
    return {
      type: "income_expense_ratio",
      title: "Income vs expense ratio",
      message: `Your income-to-expense ratio is ${ratio}x this month. You are close to break-even.`,
      severity: "warning",
      metricValue: ratio,
    };
  }

  return {
    type: "income_expense_ratio",
    title: "Income vs expense ratio",
    message: `Your income-to-expense ratio is ${ratio}x this month. Cash flow is healthy.`,
    severity: "info",
    metricValue: ratio,
  };
}

function buildBudgetWarning(budgetCategory: {
  category: string;
  forecastedSpend: number;
  budgetAmount: number;
  status: string;
} | null): GeneratedInsight {
  if (!budgetCategory) {
    return {
      type: "budget_warning",
      title: "Budget warning",
      message: "No active budgets found. Create a budget to enable warning alerts.",
      severity: "info",
      metricValue: 0,
    };
  }

  const overBy = Number((budgetCategory.forecastedSpend - budgetCategory.budgetAmount).toFixed(2));
  if (overBy > 0) {
    return {
      type: "budget_warning",
      title: "Budget warning",
      message: `${budgetCategory.category} is projected to exceed budget by $${overBy.toFixed(2)} this month.`,
      severity: "warning",
      metricValue: overBy,
    };
  }

  return {
    type: "budget_warning",
    title: "Budget warning",
    message: `${budgetCategory.category} is currently within budget trajectory.`,
    severity: "info",
    metricValue: 0,
  };
}
function buildMoMInsight(currentExpenseRows: Array<{ category: string; amount: number }>, previousExpenseRows: Array<{ category: string; amount: number }>): GeneratedInsight {
  const previousByCategory = new Map<string, number>();
  for (const row of previousExpenseRows) {
    previousByCategory.set(row.category, (previousByCategory.get(row.category) ?? 0) + row.amount);
  }

  let winner = "Overall spending";
  let delta = 0;
  let previous = 0;

  const categories = new Set<string>([
    ...currentExpenseRows.map((item) => item.category),
    ...previousExpenseRows.map((item) => item.category),
  ]);

  for (const category of categories) {
    const current = currentExpenseRows.filter((x) => x.category === category).reduce((sum, x) => sum + x.amount, 0);
    const prev = previousByCategory.get(category) ?? 0;
    const diff = current - prev;
    if (diff > delta) {
      winner = category;
      delta = diff;
      previous = prev;
    }
  }

  if (delta <= 0) {
    return {
      type: "biggest_mom_spending_increase",
      title: "Month-over-month spending",
      message: "No category increased month-over-month. Spending is stable or down across categories.",
      severity: "info",
      metricValue: 0,
    };
  }

  const pct = previous > 0 ? Number(((delta / previous) * 100).toFixed(1)) : 100;
  return {
    type: "biggest_mom_spending_increase",
    title: "Biggest month-over-month increase",
    message: `${winner} spending increased by $${delta.toFixed(2)} (${pct}%) compared with last month.`,
    severity: pct >= 25 ? "warning" : "info",
    metricValue: delta,
  };
}

function buildSavingsOpportunity(expenseRows: Array<{ merchant: string; amount: number; count: number }>): GeneratedInsight {
  const candidate = expenseRows.sort((a, b) => b.amount - a.amount)[0];

  if (!candidate || candidate.count < 2) {
    return {
      type: "savings_opportunity",
      title: "Savings opportunity",
      message: "No repeat merchant spend pattern was strong enough for a savings suggestion this month.",
      severity: "info",
      metricValue: 0,
    };
  }

  const suggested = Number((candidate.amount * 0.15).toFixed(2));
  return {
    type: "savings_opportunity",
    title: "Savings opportunity suggestion",
    message: `${candidate.merchant} has ${candidate.count} charges totaling $${candidate.amount.toFixed(2)} this month. Trimming 15% could save about $${suggested}.`,
    severity: candidate.amount > 300 ? "warning" : "info",
    metricValue: suggested,
  };
}

function buildSubscriptionCandidate(expenseRows: Array<{ merchant: string; amount: number; count: number }>): GeneratedInsight {
  const candidate = expenseRows
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.count - a.count || b.amount - a.amount)[0];

  if (!candidate) {
    return {
      type: "subscription_candidate",
      title: "Subscription candidate",
      message: "No recurring merchant pattern was strong enough for a subscription candidate this month.",
      severity: "info",
      metricValue: 0,
    };
  }

  return {
    type: "subscription_candidate",
    title: "Recurring charge candidate",
    message: `${candidate.merchant} posted ${candidate.count} similar charges this month and may be a recurring subscription.`,
    severity: "info",
    metricValue: candidate.count,
  };
}
function buildSuspiciousRepeat(
  repeatMerchant: { merchant: string; amount: number; count: number } | null,
  source: "flagged" | "duplicate_pattern" = "duplicate_pattern",
): GeneratedInsight {
  if (!repeatMerchant) {
    return {
      type: "suspicious_repeat_charge",
      title: "Suspicious repeat charge",
      message: "No suspicious repeat charges detected from synced transactions in the last 14 days.",
      severity: "info",
      metricValue: 0,
    };
  }

  if (source === "flagged") {
    return {
      type: "suspicious_repeat_charge",
      title: "Suspicious flagged merchant recurrence",
      message: `${repeatMerchant.merchant} has ${repeatMerchant.count} suspicious-flagged charges recently. Review this merchant for recurring risk.`,
      severity: "alert",
      metricValue: repeatMerchant.count,
    };
  }

  return {
    type: "suspicious_repeat_charge",
    title: "Suspicious repeat charge alert",
    message: `${repeatMerchant.merchant} posted ${repeatMerchant.count} charges of $${repeatMerchant.amount.toFixed(2)} in the last 14 days. Review for duplicates.`,
    severity: "alert",
    metricValue: repeatMerchant.count,
  };
}

export async function recomputeSmartInsights(userId: string): Promise<void> {
  const now = new Date();
  const currentStart = startOfMonth(now);
  const currentEnd = endOfMonth(now);
  const previousStart = startOfPreviousMonth(now);
  const previousEnd = endOfPreviousMonth(now);

  const [txRows, budgets] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        status: { not: TRANSACTION_STATUS.REMOVED },
        date: { gte: previousStart, lte: currentEnd },
      },
      select: {
        date: true,
        amount: true,
        cashFlowType: true,
        merchantRaw: true,
        categoryPrimary: true,
      },
    }),
    getBudgetsDataFromPrisma(userId),
  ]);

  const currentRows = txRows.filter((row) => row.date >= currentStart && row.date <= currentEnd);
  const prevRows = txRows.filter((row) => row.date >= previousStart && row.date <= previousEnd);

  const totalIncome = currentRows
    .filter((row) => row.cashFlowType === CASH_FLOW_TYPE.INCOME)
    .reduce((sum, row) => sum + toNumber(row.amount), 0);
  const totalExpense = currentRows
    .filter((row) => row.cashFlowType === CASH_FLOW_TYPE.EXPENSE)
    .reduce((sum, row) => sum + toNumber(row.amount), 0);

  const currentExpenseByCategory = currentRows
    .filter((row) => row.cashFlowType === CASH_FLOW_TYPE.EXPENSE)
    .map((row) => ({ category: row.categoryPrimary ?? "Uncategorized", amount: toNumber(row.amount) }));
  const previousExpenseByCategory = prevRows
    .filter((row) => row.cashFlowType === CASH_FLOW_TYPE.EXPENSE)
    .map((row) => ({ category: row.categoryPrimary ?? "Uncategorized", amount: toNumber(row.amount) }));

  const currentExpenseByMerchantMap = new Map<string, { amount: number; count: number }>();
  for (const row of currentRows) {
    if (row.cashFlowType !== CASH_FLOW_TYPE.EXPENSE) continue;
    const merchant = row.merchantRaw ?? "Unknown merchant";
    const current = currentExpenseByMerchantMap.get(merchant) ?? { amount: 0, count: 0 };
    current.amount += toNumber(row.amount);
    current.count += 1;
    currentExpenseByMerchantMap.set(merchant, current);
  }

  const repeatWindowStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const repeatRows = await prisma.transaction.findMany({
    where: {
      userId,
      status: { not: TRANSACTION_STATUS.REMOVED },
      date: { gte: repeatWindowStart, lte: now },
      cashFlowType: CASH_FLOW_TYPE.EXPENSE,
    },
    select: {
      merchantRaw: true,
      amount: true,
      isSuspicious: true,
    },
  });

  const repeatMap = new Map<string, { merchant: string; amount: number; count: number }>();
  const flaggedMerchantMap = new Map<string, { merchant: string; amount: number; count: number }>();

  for (const row of repeatRows) {
    const merchant = row.merchantRaw ?? "Unknown merchant";
    const amount = Number(toNumber(row.amount).toFixed(2));

    const duplicateKey = `${merchant.toLowerCase()}|${amount}`;
    const duplicateCurrent = repeatMap.get(duplicateKey) ?? { merchant, amount, count: 0 };
    duplicateCurrent.count += 1;
    repeatMap.set(duplicateKey, duplicateCurrent);

    if (row.isSuspicious) {
      const flaggedKey = merchant.toLowerCase();
      const flaggedCurrent = flaggedMerchantMap.get(flaggedKey) ?? { merchant, amount, count: 0 };
      flaggedCurrent.count += 1;
      flaggedMerchantMap.set(flaggedKey, flaggedCurrent);
    }
  }

  const flaggedRecurring = [...flaggedMerchantMap.values()]
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.count - a.count)[0] ?? null;

  const duplicatePattern = [...repeatMap.values()]
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.count - a.count)[0] ?? null;

  const suspiciousRepeat = flaggedRecurring ?? duplicatePattern;
  const suspiciousRepeatSource: "flagged" | "duplicate_pattern" = flaggedRecurring ? "flagged" : "duplicate_pattern";

  const topRiskCategory = budgets.categories
    .slice()
    .sort((a, b) => b.forecastedSpend / Math.max(1, b.budgetAmount) - a.forecastedSpend / Math.max(1, a.budgetAmount))[0];

  const topRiskInsight: GeneratedInsight = topRiskCategory
    ? {
        type: "top_risk_budget",
        title: "Top risk budget category",
        message: `${topRiskCategory.category} is at ${topRiskCategory.percentUsed.toFixed(1)}% used and projected to reach $${topRiskCategory.forecastedSpend.toFixed(2)} this month.`,
        severity:
          topRiskCategory.status === "over_budget"
            ? "alert"
            : topRiskCategory.status === "watch"
              ? "warning"
              : "info",
        metricValue: topRiskCategory.percentUsed,
      }
    : {
        type: "top_risk_budget",
        title: "Top risk budget category",
        message: "No active budgets found. Create a budget to start risk monitoring.",
        severity: "info",
      };

  const merchantRows = [...currentExpenseByMerchantMap.entries()].map(([merchant, value]) => ({
    merchant,
    amount: Number(value.amount.toFixed(2)),
    count: value.count,
  }));

  const insights: GeneratedInsight[] = [
    buildRatioInsight(totalIncome, totalExpense),
    buildBudgetWarning(
      topRiskCategory
        ? {
            category: topRiskCategory.category,
            forecastedSpend: topRiskCategory.forecastedSpend,
            budgetAmount: topRiskCategory.budgetAmount,
            status: topRiskCategory.status,
          }
        : null,
    ),
    topRiskInsight,
    buildMoMInsight(currentExpenseByCategory, previousExpenseByCategory),
    buildSubscriptionCandidate(merchantRows),
    buildSavingsOpportunity(merchantRows),
    buildSuspiciousRepeat(suspiciousRepeat, suspiciousRepeatSource),
  ];

  await prisma.spendingInsight.deleteMany({ where: { userId, insightType: { startsWith: SMART_PREFIX } } });

  if (insights.length === 0) return;

  await prisma.spendingInsight.createMany({
    data: insights.map((insight) => ({
      userId,
      insightType: `${SMART_PREFIX}${insight.type}`,
      title: insight.title,
      body: insight.message,
      periodStart: currentStart,
      periodEnd: currentEnd,
      metricValue: insight.metricValue ?? null,
      trendDirection: insight.severity,
    })),
  });
}

export async function getSmartInsightsFromPrisma(userId: string): Promise<SmartInsightCard[]> {
  const rows = await prisma.spendingInsight.findMany({
    where: {
      userId,
      insightType: { startsWith: SMART_PREFIX },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows
    .map((row) =>
      mapStoredInsight({
        id: row.id,
        insightType: row.insightType,
        title: row.title,
        body: row.body,
        trendDirection: row.trendDirection,
        createdAt: row.createdAt,
      }),
    )
    .filter((row): row is SmartInsightCard => Boolean(row));
}

export async function dismissSmartInsightInPrisma(userId: string, insightId: string): Promise<boolean> {
  const result = await prisma.spendingInsight.deleteMany({
    where: {
      id: insightId,
      userId,
      insightType: { startsWith: SMART_PREFIX },
    },
  });

  return result.count > 0;
}





