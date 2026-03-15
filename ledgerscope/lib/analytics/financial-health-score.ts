export type FinancialHealthScoreInput = {
  income: number;
  expenses: number;
  savingsRate: number;
  budgetAdherence: number;
  expenseRatio: number;
};

export type FinancialHealthScoreOutput = {
  score: number;
  factors: {
    savingsRateScore: number;
    expenseRatioScore: number;
    budgetScore: number;
    cashFlowScore: number;
  };
  explanations: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scoreSavingsRate(savingsRate: number) {
  if (savingsRate >= 25) return 30;
  if (savingsRate >= 15) return 20;
  if (savingsRate >= 5) return 10;
  return 0;
}

function scoreExpenseRatio(expenseRatio: number) {
  if (expenseRatio < 60) return 25;
  if (expenseRatio <= 80) return 15;
  return 5;
}

function scoreBudgetDiscipline(budgetAdherence: number) {
  if (budgetAdherence >= 80) return 25;
  if (budgetAdherence >= 60) return 15;
  return 5;
}

function scoreCashFlow(income: number, expenses: number) {
  const netCashFlow = income - expenses;
  const nearZeroThreshold = Math.max(50, income * 0.02);

  if (netCashFlow > nearZeroThreshold) return 20;
  if (Math.abs(netCashFlow) <= nearZeroThreshold) return 10;
  return 0;
}

export function computeFinancialHealthScore(input: FinancialHealthScoreInput): FinancialHealthScoreOutput {
  const savingsRateScore = scoreSavingsRate(input.savingsRate);
  const expenseRatioScore = scoreExpenseRatio(input.expenseRatio);
  const budgetScore = scoreBudgetDiscipline(input.budgetAdherence);
  const cashFlowScore = scoreCashFlow(input.income, input.expenses);

  const explanations: string[] = [];

  if (savingsRateScore >= 20) explanations.push("Strong savings rate");
  else if (savingsRateScore > 0) explanations.push("Savings rate is improving but still moderate");
  else explanations.push("Savings rate is below target");

  if (expenseRatioScore >= 15) explanations.push("Expense ratio is in a healthy range");
  else explanations.push("Expenses are high relative to income");

  if (input.budgetAdherence >= 80) explanations.push("Most budgets are within limits");
  else if (input.budgetAdherence >= 60) explanations.push("Budget discipline is mixed across categories");
  else explanations.push("Many budget categories are over plan");

  if (cashFlowScore === 20) explanations.push("Cash flow is stable and positive");
  else if (cashFlowScore === 10) explanations.push("Cash flow is near break-even");
  else explanations.push("Cash flow is negative this period");

  const score = clamp(savingsRateScore + expenseRatioScore + budgetScore + cashFlowScore, 0, 100);

  return {
    score,
    factors: {
      savingsRateScore,
      expenseRatioScore,
      budgetScore,
      cashFlowScore,
    },
    explanations,
  };
}
