import { getBudgetsDataFromPrisma } from "@/lib/db/budget-forecast-store";
import { getDashboardCashflowSnapshot } from "@/lib/db/transaction-store";
import { computeFinancialHealthScore } from "@/lib/analytics/financial-health-score";

export type FinancialHealthMetrics = {
  score: number;
  savingsRate: number;
  expenseRatio: number;
  explanations: string[];
};

export async function getFinancialHealthMetrics(userId: string): Promise<FinancialHealthMetrics> {
  const [cashflow, budgets] = await Promise.all([
    getDashboardCashflowSnapshot(userId),
    getBudgetsDataFromPrisma(userId),
  ]);

  const income = cashflow.totalIncomeThisMonth;
  const expenses = cashflow.totalExpensesThisMonth;

  const savingsRate = income > 0 ? Number((((income - expenses) / income) * 100).toFixed(1)) : 0;
  const expenseRatio =
    income > 0 ? Number(((expenses / income) * 100).toFixed(1)) : expenses > 0 ? 100 : 0;

  const budgetCount = budgets.categories.length;
  const withinBudgetCount = budgets.categories.filter((item) => item.actualSpent + item.pendingSpent <= item.budgetAmount).length;
  const budgetAdherence =
    budgetCount > 0
      ? Number(((withinBudgetCount / budgetCount) * 100).toFixed(1))
      : 60;

  const computed = computeFinancialHealthScore({
    income,
    expenses,
    savingsRate,
    budgetAdherence,
    expenseRatio,
  });

  const explanations = [...computed.explanations];
  if (budgetCount === 0) {
    explanations.push("No budgets configured yet, using neutral budget discipline score");
  }

  return {
    score: computed.score,
    savingsRate,
    expenseRatio,
    explanations,
  };
}
