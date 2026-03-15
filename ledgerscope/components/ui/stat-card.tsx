import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string;
  trend?: string;
  tone?: "neutral" | "positive" | "warning" | "critical";
  meta?: ReactNode;
  align?: "left" | "right";
};

const toneMap = {
  neutral: "text-slate-600",
  positive: "text-emerald-600",
  warning: "text-amber-600",
  critical: "text-rose-600",
};

export function StatCard({ label, value, trend, tone = "neutral", meta, align = "left" }: StatCardProps) {
  return (
    <article className="flex min-h-[146px] flex-col rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold leading-tight text-slate-900 ${align === "right" ? "text-right" : "text-left"}`}>
        {value}
      </p>
      {trend ? (
        <p className={`mt-2 line-clamp-2 text-xs ${toneMap[tone]} ${align === "right" ? "text-right" : "text-left"}`}>{trend}</p>
      ) : null}
      {meta ? <div className="mt-3 text-xs text-slate-600">{meta}</div> : null}
    </article>
  );
}

