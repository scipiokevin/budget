export type HeaderAction = {
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
};

type TopHeaderProps = {
  title: string;
  description?: string;
  selectedRange?: string | null;
  rangeOptions?: string[] | null;
  actions?: HeaderAction[] | null;
  onActionClick?: (action: HeaderAction) => void;
};

function actionClass(action: HeaderAction) {
  const label = typeof action.label === "string" ? action.label : "";
  const isConnect = label.toLowerCase().includes("connect bank");
  if (isConnect || action.variant !== "secondary") {
    return "rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60";
  }

  return "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
}

export function TopHeader({
  title,
  description,
  selectedRange = "This month",
  rangeOptions = ["Last 7 days", "This month", "Last 3 months", "Year to date"],
  actions = [],
  onActionClick,
}: TopHeaderProps) {
  const safeRangeOptions = Array.isArray(rangeOptions) && rangeOptions.length > 0
    ? rangeOptions
    : ["Last 7 days", "This month", "Last 3 months", "Year to date"];

  const safeSelectedRange =
    typeof selectedRange === "string" && selectedRange.length > 0
      ? selectedRange
      : safeRangeOptions[0];

  const safeActions = Array.isArray(actions)
    ? actions.filter((action): action is HeaderAction => Boolean(action && typeof action.label === "string" && action.label.length > 0))
    : [];

  return (
    <header className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {description ? <p className="max-w-2xl text-sm text-slate-600">{description}</p> : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>Date range</span>
            <select
              defaultValue={safeSelectedRange}
              className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              {safeRangeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            {safeActions.map((action, index) => (
              <button
                key={`${action.label}-${index}`}
                type="button"
                onClick={() => onActionClick?.(action)}
                className={actionClass(action)}
                disabled={Boolean(action.disabled || action.loading)}
              >
                {action.loading ? action.loadingLabel ?? "Working..." : action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
