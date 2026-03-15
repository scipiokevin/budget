import type { MonthlyTrendPoint } from "@/types/contracts";
import { formatCurrencyAmount } from "@/lib/utils/format";

type MonthlySpendingTrendChartProps = {
  points: MonthlyTrendPoint[];
};

export function MonthlySpendingTrendChart({ points }: MonthlySpendingTrendChartProps) {
  const max = Math.max(1, ...points.map((point) => point.expense));

  return (
    <div className="space-y-2">
      {points.map((point) => {
        const width = Math.max(3, Math.round((point.expense / max) * 100));
        return (
          <div key={point.month} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>{point.month}</span>
              <span>{formatCurrencyAmount(point.expense)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-rose-500" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
