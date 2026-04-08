"use client";

import { useMemo, useState } from "react";
import type { SmartInsightCard } from "@/types/contracts";

type SmartInsightItemCardProps = {
  insight: SmartInsightCard;
  onDismiss?: (id: string) => void;
};

function severityStyles(severity: SmartInsightCard["severity"]) {
  if (severity === "alert") {
    return {
      wrap: "border-rose-200 bg-rose-50",
      icon: "!",
      iconClass: "bg-rose-100 text-rose-700",
      text: "text-rose-800",
      pill: "bg-rose-100 text-rose-700",
      label: "Alert",
    };
  }

  if (severity === "warning") {
    return {
      wrap: "border-amber-200 bg-amber-50",
      icon: "!",
      iconClass: "bg-amber-100 text-amber-700",
      text: "text-amber-800",
      pill: "bg-amber-100 text-amber-700",
      label: "Warning",
    };
  }

  return {
    wrap: "border-slate-200 bg-slate-50",
    icon: "i",
    iconClass: "bg-slate-200 text-slate-700",
    text: "text-slate-800",
    pill: "bg-slate-200 text-slate-700",
    label: "Info",
  };
}

function shouldCollapse(message: string) {
  return message.trim().length > 120;
}

export function SmartInsightItemCard({ insight, onDismiss }: SmartInsightItemCardProps) {
  const styles = severityStyles(insight.severity);
  const [expanded, setExpanded] = useState(false);
  const canExpand = useMemo(() => shouldCollapse(insight.message), [insight.message]);

  return (
    <article className={`rounded-2xl border px-4 py-3 ${styles.wrap}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${styles.iconClass}`}>
            {styles.icon}
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${styles.text}`}>{insight.title}</p>
            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${styles.pill}`}>
              {styles.label}
            </span>
          </div>
        </div>

        {onDismiss ? (
          <button
            type="button"
            onClick={() => onDismiss(insight.id)}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 transition-colors duration-150 hover:bg-slate-50"
            aria-label={`Dismiss insight: ${insight.title}`}
          >
            Dismiss
          </button>
        ) : null}
      </div>

      <p className={`text-sm leading-6 ${styles.text} ${!expanded && canExpand ? "line-clamp-3" : ""}`}>{insight.message}</p>

      {canExpand ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-lg border border-transparent px-1 py-0.5 text-xs font-medium text-slate-700 transition-colors duration-150 hover:border-slate-300 hover:bg-white/70"
            aria-expanded={expanded}
            aria-label={expanded ? `Show less for insight: ${insight.title}` : `Show more for insight: ${insight.title}`}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        </div>
      ) : null}
    </article>
  );
}
