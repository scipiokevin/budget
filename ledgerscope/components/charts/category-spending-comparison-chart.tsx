import type { SpendingTrend } from "@/types/contracts";
import { formatCurrencyAmount } from "@/lib/utils/format";

type CategorySpendingComparisonChartProps = {
  items: SpendingTrend[];
};

export function CategorySpendingComparisonChart({ items }: CategorySpendingComparisonChartProps) {
  const max = Math.max(1, ...items.flatMap((item) => [item.monthlyAmount, item.priorAmount ?? 0]));

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const currentWidth = Math.max(3, Math.round((item.monthlyAmount / max) * 100));
        const priorWidth = Math.max(3, Math.round(((item.priorAmount ?? 0) / max) * 100));

        return (
          <div key={item.category} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{item.category}</p>
              <p className={`text-xs font-semibold ${item.changePct > 0 ? "text-amber-700" : item.changePct < 0 ? "text-emerald-700" : "text-slate-600"}`}>
                {item.changePct >= 0 ? "+" : ""}{item.changePct.toFixed(1)}%
              </p>
            </div>

            <div className="space-y-1 text-xs text-slate-600">
              <div className="flex items-center justify-between"><span>Current</span><span>{formatCurrencyAmount(item.monthlyAmount)}</span></div>
              <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-slate-800" style={{ width: `${currentWidth}%` }} /></div>
              <div className="flex items-center justify-between"><span>Prior</span><span>{formatCurrencyAmount(item.priorAmount ?? 0)}</span></div>
              <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-slate-400" style={{ width: `${priorWidth}%` }} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
