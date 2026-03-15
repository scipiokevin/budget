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

export function SmartInsightItemCard({ insight, onDismiss }: SmartInsightItemCardProps) {
  const styles = severityStyles(insight.severity);

  return (
    <article className={`rounded-2xl border px-4 py-3 ${styles.wrap}`}>
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${styles.iconClass}`}>
            {styles.icon}
          </span>
          <div>
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
            className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 transition-colors duration-150 hover:bg-slate-50"
          >
            Dismiss
          </button>
        ) : null}
      </div>
      <p className={`line-clamp-1 text-sm ${styles.text}`}>{insight.message}</p>
    </article>
  );
}
