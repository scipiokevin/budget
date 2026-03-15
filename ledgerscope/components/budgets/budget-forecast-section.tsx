import type { ForecastOverviewData } from "@/types/contracts";
import { formatCurrencyAmount } from "@/lib/utils/format";

type BudgetForecastSectionProps = {
  forecast: ForecastOverviewData;
};

export function BudgetForecastSection({ forecast }: BudgetForecastSectionProps) {
  const summaries = Array.isArray(forecast.summaries) ? forecast.summaries : [];
  const snapshots = Array.isArray(forecast.snapshots) ? forecast.snapshots : [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Forecast Overview</h3>
      <p className="text-sm text-slate-600">{forecast.periodLabel}</p>

      <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
        <p>Budget: {formatCurrencyAmount(forecast.totalBudget)}</p>
        <p>Actual: {formatCurrencyAmount(forecast.totalActual)}</p>
        <p>Projected: {formatCurrencyAmount(forecast.totalProjected)}</p>
      </div>

      <div className="mt-4 space-y-2">
        {summaries.map((line, index) => (
          <p key={`forecast-summary-${index}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {line}
          </p>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {snapshots.length === 0 ? (
          <p className="text-sm text-slate-500">No forecast snapshots yet.</p>
        ) : (
          snapshots.map((item) => (
            <article key={item.category} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-800">{item.category}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{item.status}</span>
              </div>
              <p className="text-slate-600">
                {formatCurrencyAmount(item.actualSpent)} actual / {formatCurrencyAmount(item.projectedSpent)} projected / {formatCurrencyAmount(item.budgetTarget)} budget
              </p>
              <p className="text-slate-600">{item.explanation}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
