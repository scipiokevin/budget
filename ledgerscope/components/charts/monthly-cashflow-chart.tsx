import type { MonthlyTrendPoint } from "@/types/contracts";
import { formatCurrencyAmount } from "@/lib/utils/format";

type MonthlyCashflowChartProps = {
  points: MonthlyTrendPoint[];
};

export function MonthlyCashflowChart({ points }: MonthlyCashflowChartProps) {
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [Math.abs(point.income), Math.abs(point.expense), Math.abs(point.netCashFlow)]),
  );

  return (
    <div className="space-y-2">
      {points.map((point) => {
        const incomeWidth = Math.max(3, Math.round((Math.abs(point.income) / maxValue) * 100));
        const expenseWidth = Math.max(3, Math.round((Math.abs(point.expense) / maxValue) * 100));
        const netWidth = Math.max(3, Math.round((Math.abs(point.netCashFlow) / maxValue) * 100));

        return (
          <div key={point.month} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{point.month}</p>
            <div className="space-y-2 text-xs">
              <div>
                <div className="mb-1 flex items-center justify-between text-slate-600">
                  <span>Income</span>
                  <span>{formatCurrencyAmount(point.income)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${incomeWidth}%` }} />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-slate-600">
                  <span>Expenses</span>
                  <span>{formatCurrencyAmount(point.expense)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div className="h-2 rounded-full bg-rose-500" style={{ width: `${expenseWidth}%` }} />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-slate-600">
                  <span>Net cash flow</span>
                  <span>{formatCurrencyAmount(point.netCashFlow)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div className={`h-2 rounded-full ${point.netCashFlow >= 0 ? "bg-sky-500" : "bg-amber-500"}`} style={{ width: `${netWidth}%` }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
