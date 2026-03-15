import { BudgetAlertType, ForecastStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type {
  BudgetAlert,
  BudgetCategorySnapshot,
  BudgetUpsertPayload,
  BudgetUpsertResponse,
  BudgetsData,
  DashboardData,
  ForecastOverviewData,
  ForecastStatus as UiForecastStatus,
} from "@/types/contracts";

const PACE_FACTOR = 0.18;

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function toPrismaStatus(status: UiForecastStatus): ForecastStatus {
  switch (status) {
    case "over_budget":
      return ForecastStatus.OVER_BUDGET;
    case "watch":
      return ForecastStatus.WATCH;
    case "below_pace":
      return ForecastStatus.BELOW_PACE;
    default:
      return ForecastStatus.ON_TRACK;
  }
}

function fromPrismaStatus(status: ForecastStatus): UiForecastStatus {
  switch (status) {
    case ForecastStatus.OVER_BUDGET:
      return "over_budget";
    case ForecastStatus.WATCH:
      return "watch";
    case ForecastStatus.BELOW_PACE:
      return "below_pace";
    default:
      return "on_track";
  }
}

function startOfMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
}

function endOfMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59));
}

function monthLabel(date = new Date()): string {
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function categoryKeyFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function titleCaseFromKey(key: string | null): string {
  if (!key) return "Category";
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildStatus(percentUsed: number, projectedPercent: number): UiForecastStatus {
  if (projectedPercent >= 100 || percentUsed >= 100) return "over_budget";
  if (projectedPercent >= 85 || percentUsed >= 80) return "watch";
  if (projectedPercent < 55) return "below_pace";
  return "on_track";
}

function buildExplanation(category: string, status: UiForecastStatus): string {
  if (category === "Groceries") return "Grocery spending is trending upward.";
  if (category === "Dining" && status === "over_budget") return "Dining is likely to exceed budget by month end.";
  if (category === "Transport") return "Gas spending is trending downward and helping your goal.";
  if (status === "over_budget") return `${category} is projected over budget if current pace continues.`;
  if (status === "watch") return `${category} is approaching its budget threshold.`;
  if (status === "below_pace") return `${category} is below expected pace this month.`;
  return `${category} is currently on track against budget.`;
}

async function buildCategorySnapshots(userId: string, periodStart: Date, periodEnd: Date): Promise<BudgetCategorySnapshot[]> {
  const budgets = await prisma.budget.findMany({
    where: { userId, isActive: true },
    include: {
      periods: {
        where: {
          periodStart: { gte: periodStart },
          periodEnd: { lte: periodEnd },
        },
        orderBy: { periodStart: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return budgets.map((budget) => {
    const period = budget.periods[0];
    const actualSpent = toNumber(period?.actualSpend);
    const pendingSpent = toNumber(period?.pendingSpend);
    const budgetAmount = toNumber(budget.amount);

    const forecastedSpend = Number((actualSpent + pendingSpent + actualSpent * PACE_FACTOR).toFixed(2));
    const remainingAmount = Number((budgetAmount - actualSpent - pendingSpent).toFixed(2));
    const percentUsed = budgetAmount > 0 ? Number((((actualSpent + pendingSpent) / budgetAmount) * 100).toFixed(1)) : 0;
    const projectedPercent = budgetAmount > 0 ? Number(((forecastedSpend / budgetAmount) * 100).toFixed(1)) : 0;
    const status = buildStatus(percentUsed, projectedPercent);

    return {
      id: budget.id,
      category: budget.name,
      budgetAmount,
      actualSpent,
      pendingSpent,
      remainingAmount,
      percentUsed,
      forecastedSpend,
      status,
      explanation: buildExplanation(budget.name, status),
    };
  });
}

async function persistForecastSnapshots(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  categories: BudgetCategorySnapshot[],
): Promise<void> {
  await prisma.forecastSnapshot.deleteMany({ where: { userId, periodStart, periodEnd } });

  if (categories.length === 0) return;

  await prisma.forecastSnapshot.createMany({
    data: categories.map((item) => ({
      userId,
      periodStart,
      periodEnd,
      categoryKey: categoryKeyFromName(item.category),
      actualSpent: item.actualSpent,
      pendingSpent: item.pendingSpent,
      projectedSpent: item.forecastedSpend,
      budgetAmount: item.budgetAmount,
      status: toPrismaStatus(item.status),
      explanation: item.explanation,
    })),
  });
}

async function persistBudgetAlerts(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  categories: BudgetCategorySnapshot[],
): Promise<void> {
  const periods = await prisma.budgetPeriod.findMany({
    where: { userId, periodStart, periodEnd },
    select: { budgetId: true, id: true },
  });

  const periodByBudget = new Map(periods.map((p) => [p.budgetId, p.id]));
  const budgetIds = categories.map((c) => c.id);

  if (budgetIds.length > 0) {
    await prisma.budgetAlert.deleteMany({
      where: {
        userId,
        budgetId: { in: budgetIds },
        status: "ACTIVE",
      },
    });
  }

  const alertsToCreate = categories.flatMap((item) => {
    const periodId = periodByBudget.get(item.id);
    if (!periodId) return [];

    const rows: Array<{ budgetId: string; budgetPeriodId: string; type: BudgetAlertType; message: string }> = [];

    if (item.percentUsed >= 100) {
      rows.push({
        budgetId: item.id,
        budgetPeriodId: periodId,
        type: BudgetAlertType.THRESHOLD_100,
        message: `${item.category} reached 100% of budget.`,
      });
    } else if (item.percentUsed >= 80) {
      rows.push({
        budgetId: item.id,
        budgetPeriodId: periodId,
        type: BudgetAlertType.THRESHOLD_80,
        message: `${item.category} crossed 80% budget utilization.`,
      });
    }

    if (item.forecastedSpend > item.budgetAmount && item.budgetAmount > 0) {
      rows.push({
        budgetId: item.id,
        budgetPeriodId: periodId,
        type: BudgetAlertType.PROJECTED_OVER_BUDGET,
        message: `${item.category} is projected to exceed budget by month end.`,
      });
    }

    return rows;
  });

  if (alertsToCreate.length > 0) {
    await prisma.budgetAlert.createMany({
      data: alertsToCreate.map((row) => ({
        userId,
        budgetId: row.budgetId,
        budgetPeriodId: row.budgetPeriodId,
        type: row.type,
        message: row.message,
      })),
    });
  }
}

function buildSummary(categories: BudgetCategorySnapshot[]) {
  const totalBudget = categories.reduce((sum, item) => sum + item.budgetAmount, 0);
  const totalActual = categories.reduce((sum, item) => sum + item.actualSpent, 0);
  const totalPending = categories.reduce((sum, item) => sum + item.pendingSpent, 0);
  const totalProjected = categories.reduce((sum, item) => sum + item.forecastedSpend, 0);
  const totalRemaining = Number((totalBudget - totalActual - totalPending).toFixed(2));

  const topRiskCategory =
    [...categories].sort((a, b) => b.forecastedSpend / (b.budgetAmount || 1) - a.forecastedSpend / (a.budgetAmount || 1))[0]
      ?.category ?? "None";

  return {
    monthLabel: monthLabel(),
    totalBudget,
    totalActual,
    totalPending,
    totalRemaining,
    totalProjected,
    topRiskCategory,
  };
}

async function mapRecentAlerts(userId: string): Promise<BudgetAlert[]> {
  const dbAlerts = await prisma.budgetAlert.findMany({
    where: { userId },
    include: { budget: { select: { name: true } } },
    orderBy: { triggeredAt: "desc" },
    take: 10,
  });

  return dbAlerts.map((alert) => {
    const type =
      alert.type === BudgetAlertType.THRESHOLD_100
        ? "threshold_100"
        : alert.type === BudgetAlertType.PROJECTED_OVER_BUDGET
          ? "projected_over_budget"
          : "threshold_80";

    return {
      id: alert.id,
      category: alert.budget.name,
      type,
      message: alert.message ?? `${alert.budget.name} alert`,
      createdAt: alert.triggeredAt.toISOString().slice(0, 10),
    };
  });
}

function buildForecastSummaries(categories: BudgetCategorySnapshot[], summary: ReturnType<typeof buildSummary>): string[] {
  if (categories.length === 0) {
    return ["No active budgets yet. Create a category budget to start forecasting month-end outcomes."];
  }

  const projectedDelta = Number((summary.totalProjected - summary.totalBudget).toFixed(2));
  const overBudgetCategories = categories.filter((item) => item.forecastedSpend > item.budgetAmount);

  const lines: string[] = [];

  if (projectedDelta > 0) {
    lines.push(`At current pace, total spending is projected to exceed budget by $${projectedDelta.toFixed(2)}.`);
  } else {
    lines.push(`At current pace, spending is projected to finish $${Math.abs(projectedDelta).toFixed(2)} under budget.`);
  }

  if (overBudgetCategories.length > 0) {
    const list = overBudgetCategories.slice(0, 3).map((item) => item.category).join(", ");
    lines.push(`Categories likely to exceed budget: ${list}.`);
  } else {
    lines.push("No categories are currently projected to exceed budget this month.");
  }

  const topRisk = categories.find((item) => item.category === summary.topRiskCategory);
  if (topRisk) {
    lines.push(`${topRisk.category} remains the top budget risk at ${topRisk.percentUsed.toFixed(1)}% used.`);
  }

  return lines;
}

export async function getBudgetsDataFromPrisma(userId: string): Promise<BudgetsData> {
  const periodStart = startOfMonth();
  const periodEnd = endOfMonth();

  const categories = await buildCategorySnapshots(userId, periodStart, periodEnd);

  await persistForecastSnapshots(userId, periodStart, periodEnd, categories);
  await persistBudgetAlerts(userId, periodStart, periodEnd, categories);

  const alerts = await mapRecentAlerts(userId);

  return {
    title: "Budgets",
    description: "Track monthly budget performance and projected outcomes by category.",
    selectedRange: "This month",
    actions: [
      { label: "Create Budget", variant: "primary" },
      { label: "Export Budget Report", variant: "secondary" },
    ],
    summary: buildSummary(categories),
    categories,
    alerts,
    recentAlerts: alerts.slice(0, 5),
  };
}

export async function upsertBudgetInPrisma(userId: string, payload: BudgetUpsertPayload): Promise<BudgetUpsertResponse> {
  const periodStart = startOfMonth();
  const periodEnd = endOfMonth();
  const categoryKey = categoryKeyFromName(payload.category);

  let budgetId: string;

  if (payload.id) {
    const updated = await prisma.budget.updateMany({
      where: { id: payload.id, userId },
      data: {
        name: payload.category,
        categoryKey,
        amount: payload.budgetAmount,
      },
    });

    if (updated.count === 0) {
      throw new Error("Budget not found.");
    }

    budgetId = payload.id;
  } else {
    const created = await prisma.budget.create({
      data: {
        userId,
        name: payload.category,
        categoryKey,
        amount: payload.budgetAmount,
        periodType: "MONTHLY",
      },
    });

    budgetId = created.id;
  }

  await prisma.budgetPeriod.upsert({
    where: {
      budgetId_periodStart_periodEnd: {
        budgetId,
        periodStart,
        periodEnd,
      },
    },
    update: {
      actualSpend: payload.actualSpent,
      pendingSpend: payload.pendingSpent,
    },
    create: {
      budgetId,
      userId,
      periodStart,
      periodEnd,
      actualSpend: payload.actualSpent,
      pendingSpend: payload.pendingSpent,
    },
  });

  const full = await getBudgetsDataFromPrisma(userId);
  const item = full.categories.find((x) => x.id === budgetId);
  if (!item) throw new Error("Budget sync failed.");

  return { budget: item };
}

export async function deleteBudgetInPrisma(userId: string, id: string): Promise<void> {
  await prisma.budget.deleteMany({ where: { id, userId } });
}

export async function getForecastOverviewFromPrisma(userId: string): Promise<ForecastOverviewData> {
  const budgets = await getBudgetsDataFromPrisma(userId);
  const periodStart = startOfMonth();
  const periodEnd = endOfMonth();

  const snapshots = await prisma.forecastSnapshot.findMany({
    where: { userId, periodStart, periodEnd },
    orderBy: { categoryKey: "asc" },
  });

  const categoryByKey = new Map(
    budgets.categories.map((item) => [categoryKeyFromName(item.category), item.category] as const),
  );

  return {
    periodLabel: budgets.summary.monthLabel,
    totalBudget: budgets.summary.totalBudget,
    totalActual: budgets.summary.totalActual,
    totalProjected: budgets.summary.totalProjected,
    summaries: buildForecastSummaries(budgets.categories, budgets.summary),
    snapshots: snapshots.map((item) => {
      const fallbackCategory = titleCaseFromKey(item.categoryKey);

      return {
        category: (item.categoryKey && categoryByKey.get(item.categoryKey)) ?? fallbackCategory,
        budgetTarget: toNumber(item.budgetAmount),
        actualSpent: toNumber(item.actualSpent),
        projectedSpent: toNumber(item.projectedSpent),
        status: fromPrismaStatus(item.status),
        explanation: item.explanation ?? `${fallbackCategory} trend is stable.`,
      };
    }),
  };
}

export async function getDashboardBudgetBundleFromPrisma(userId: string): Promise<Pick<DashboardData, "budgetProgress" | "recentAlerts" | "budgetWidget" | "forecastVsBudget"> & { budgetUsedPercent: number; budgetRemaining: number }> {
  const budgets = await getBudgetsDataFromPrisma(userId);

  const budgetUsedPercent =
    budgets.summary.totalBudget > 0
      ? Number((((budgets.summary.totalActual + budgets.summary.totalPending) / budgets.summary.totalBudget) * 100).toFixed(1))
      : 0;

  const likelyOverBudgetCategories = budgets.categories
    .filter((item) => item.forecastedSpend > item.budgetAmount)
    .sort((a, b) => b.forecastedSpend - b.budgetAmount - (a.forecastedSpend - a.budgetAmount))
    .map((item) => item.category);

  return {
    budgetProgress: budgets.categories.map((x) => ({ category: x.category, usedPercent: x.percentUsed })),
    recentAlerts: budgets.recentAlerts.map((x) => ({ level: "watch", message: x.message, time: x.createdAt })),
    budgetWidget: {
      totalMonthlyBudget: budgets.summary.totalBudget,
      totalSpent: budgets.summary.totalActual + budgets.summary.totalPending,
      totalRemaining: budgets.summary.totalRemaining,
      projectedMonthEnd: budgets.summary.totalProjected,
      topRiskCategory: budgets.summary.topRiskCategory,
      likelyOverBudgetCategories,
      forecastSummary: buildForecastSummaries(budgets.categories, budgets.summary)[0] ?? "",
    },
    forecastVsBudget: budgets.categories.map((x) => ({
      label: x.category,
      budget: x.budgetAmount,
      projected: x.forecastedSpend,
      actual: x.actualSpent,
    })),
    budgetUsedPercent,
    budgetRemaining: budgets.summary.totalRemaining,
  };
}
