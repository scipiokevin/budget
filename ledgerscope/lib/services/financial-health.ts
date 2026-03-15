import type { FinancialHealthScore, MonthlyTrendPoint } from "@/types/contracts";

type Input = {
  savingsRate: number;
  incomeExpenseRatio: number;
  budgetUsedPercent: number;
  netCashFlow: number;
  monthlyTrends: MonthlyTrendPoint[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scoreSavingsRate(savingsRate: number) {
  if (savingsRate >= 20) return { points: 24, label: "Good", status: "good" as const };
  if (savingsRate >= 10) return { points: 16, label: "Watch", status: "fair" as const };
  return { points: 6, label: "Needs attention", status: "watch" as const };
}

function scoreExpenseRatio(ratio: number) {
  if (ratio >= 1.3) return { points: 22, label: "Good", status: "good" as const };
  if (ratio >= 1.05) return { points: 15, label: "Watch", status: "fair" as const };
  return { points: 6, label: "Needs attention", status: "watch" as const };
}

function scoreBudgetAdherence(budgetUsedPercent: number) {
  if (budgetUsedPercent <= 85) return { points: 18, label: "Strong", status: "good" as const };
  if (budgetUsedPercent <= 100) return { points: 12, label: "Watch", status: "fair" as const };
  return { points: 5, label: "Needs attention", status: "watch" as const };
}

function scoreCashFlowStability(netCashFlow: number, trends: MonthlyTrendPoint[]) {
  const lastThree = trends.slice(-3).map((point) => point.netCashFlow);
  const allPositive = lastThree.length > 0 && lastThree.every((value) => value >= 0);
  const improving =
    trends.length >= 2 ? trends[trends.length - 1].netCashFlow >= trends[trends.length - 2].netCashFlow : netCashFlow >= 0;

  if (allPositive && improving) return { points: 18, label: "Stable", status: "good" as const };
  if (netCashFlow >= 0 || improving) return { points: 12, label: "Watch", status: "fair" as const };
  return { points: 5, label: "Unstable", status: "watch" as const };
}

function scoreSpendingVolatilityPlaceholder(trends: MonthlyTrendPoint[]) {
  if (trends.length < 3) {
    return { points: 8, label: "Placeholder", status: "fair" as const };
  }

  const expenses = trends.map((point) => point.expense);
  const avg = expenses.reduce((sum, value) => sum + value, 0) / Math.max(1, expenses.length);
  const variance = expenses.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(1, expenses.length);
  const stdDev = Math.sqrt(variance);
  const coefficient = avg > 0 ? stdDev / avg : 0;

  if (coefficient <= 0.15) return { points: 14, label: "Low", status: "good" as const };
  if (coefficient <= 0.3) return { points: 10, label: "Moderate", status: "fair" as const };
  return { points: 6, label: "High", status: "watch" as const };
}

export function calculateFinancialHealthScore(input: Input): FinancialHealthScore {
  const savings = scoreSavingsRate(input.savingsRate);
  const ratio = scoreExpenseRatio(input.incomeExpenseRatio);
  const budget = scoreBudgetAdherence(input.budgetUsedPercent);
  const cashFlow = scoreCashFlowStability(input.netCashFlow, input.monthlyTrends);
  const volatility = scoreSpendingVolatilityPlaceholder(input.monthlyTrends);

  const score = clamp(savings.points + ratio.points + budget.points + cashFlow.points + volatility.points, 0, 100);

  return {
    score,
    factors: [
      { label: "Savings Rate", value: savings.label, status: savings.status },
      { label: "Expense Ratio", value: ratio.label, status: ratio.status },
      { label: "Budget Discipline", value: budget.label, status: budget.status },
      { label: "Cash Flow", value: cashFlow.label, status: cashFlow.status },
      { label: "Spending Volatility", value: volatility.label, status: volatility.status },
    ],
    explanation: `Savings Rate: ${savings.label} | Budget Discipline: ${budget.label} | Cash Flow: ${cashFlow.label}`,
  };
}
