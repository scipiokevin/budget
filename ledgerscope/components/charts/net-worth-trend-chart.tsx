"use client";

import type { NetWorthTrendPoint } from "@/types/contracts";
import { formatCurrencyAmount } from "@/lib/utils/format";

type NetWorthTrendChartProps = {
  points: NetWorthTrendPoint[];
};

export function NetWorthTrendChart({ points }: NetWorthTrendChartProps) {
  if (points.length === 0) {
    return <p className="text-sm text-slate-500">No net worth trend data yet.</p>;
  }

  const maxNetWorth = Math.max(...points.map((point) => Math.abs(point.netWorth)), 1);

  return (
    <div className="space-y-2">
      {points.map((point) => {
        const width = Math.max(4, Math.round((Math.abs(point.netWorth) / maxNetWorth) * 100));
        const isNegative = point.netWorth < 0;

        return (
          <div key={point.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{point.label}</span>
              <span className={isNegative ? "text-rose-600" : "text-emerald-700"}>{formatCurrencyAmount(point.netWorth)}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div
                className={`h-2 rounded-full ${isNegative ? "bg-rose-300" : "bg-emerald-500"}`}
                style={{ width: `${width}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
