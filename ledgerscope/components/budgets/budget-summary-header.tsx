import type { BudgetSummary } from "@/types/contracts";
import { formatCurrencyAmount } from "@/lib/utils/format";

type BudgetSummaryHeaderProps = {
  summary: BudgetSummary;
};

export function BudgetSummaryHeader({ summary }: BudgetSummaryHeaderProps) {
  const cards = [
    { label: "Total Budget", value: formatCurrencyAmount(summary.totalBudget) },
    { label: "Actual Spent", value: formatCurrencyAmount(summary.totalActual) },
    { label: "Pending", value: formatCurrencyAmount(summary.totalPending) },
    { label: "Remaining", value: formatCurrencyAmount(summary.totalRemaining) },
    { label: "Projected", value: formatCurrencyAmount(summary.totalProjected) },
    { label: "Top Risk", value: summary.topRiskCategory || "None" },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{card.value}</p>
        </article>
      ))}
    </section>
  );
}
