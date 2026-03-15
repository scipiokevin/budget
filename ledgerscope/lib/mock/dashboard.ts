import { formatCurrency, formatCurrencyCompact } from "@/lib/utils/format";

export const dashboardMock = {
  totalIncomeMonth: 9420,
  totalExpensesMonth: 6125,
  netCashFlow: 3295,
  budgetUsedPercent: 68,
  budgetRemaining: 2875,
  nextPaycheck: {
    employer: "Northline Logistics",
    date: "Mar 13, 2026",
    amount: 2350,
  },
  incomeVsExpense: [
    { label: "Week 1", income: 2200, expense: 1450 },
    { label: "Week 2", income: 2350, expense: 1580 },
    { label: "Week 3", income: 2300, expense: 1735 },
    { label: "Week 4", income: 2570, expense: 1360 },
  ],
  spendingTrends: [
    { category: "Dining", changePct: 14, monthly: 640 },
    { category: "Groceries", changePct: 8, monthly: 780 },
    { category: "Fuel", changePct: -6, monthly: 280 },
    { category: "Subscriptions", changePct: 3, monthly: 160 },
  ],
  budgetProgress: [
    { category: "Housing", used: 78 },
    { category: "Groceries", used: 64 },
    { category: "Dining", used: 89 },
    { category: "Transport", used: 53 },
  ],
  recentAlerts: [
    {
      level: "watch",
      message: "Dining is above 3-month average by 14%.",
      time: "2h ago",
    },
    {
      level: "info",
      message: "Paycheck from Northline Logistics expected in 5 days.",
      time: "Today",
    },
    {
      level: "watch",
      message: "Similar charge to previously flagged merchant appeared.",
      time: "Yesterday",
    },
  ],
};

export function dashboardSummaryCards() {
  const d = dashboardMock;

  return [
    {
      label: "Total income this month",
      value: formatCurrency(d.totalIncomeMonth),
      trend: "+6.3% vs last month",
      tone: "positive" as const,
    },
    {
      label: "Total expenses this month",
      value: formatCurrency(d.totalExpensesMonth),
      trend: "+2.1% vs last month",
      tone: "warning" as const,
    },
    {
      label: "Net cash flow",
      value: formatCurrency(d.netCashFlow),
      trend: "On track for your monthly target",
      tone: "positive" as const,
    },
    {
      label: "Budget status",
      value: `${d.budgetUsedPercent}% used`,
      trend: `${formatCurrency(d.budgetRemaining)} remaining`,
      tone: "neutral" as const,
    },
    {
      label: "Next expected paycheck",
      value: d.nextPaycheck.date,
      trend: `${d.nextPaycheck.employer} • ${formatCurrencyCompact(d.nextPaycheck.amount)}`,
      tone: "neutral" as const,
    },
  ];
}

