import type { BudgetCategorySnapshot } from "@/types/contracts";
import { formatCurrencyAmount } from "@/lib/utils/format";

type BudgetCategoryCardProps = {
  item: BudgetCategorySnapshot;
  onEdit: (item: BudgetCategorySnapshot) => void;
  onDelete: (item: BudgetCategorySnapshot) => void;
  deleteLoading?: boolean;
};

function statusColor(status: BudgetCategorySnapshot["status"]) {
  switch (status) {
    case "over_budget":
      return "bg-rose-100 text-rose-700";
    case "watch":
      return "bg-amber-100 text-amber-700";
    case "below_pace":
      return "bg-sky-100 text-sky-700";
    default:
      return "bg-emerald-100 text-emerald-700";
  }
}

export function BudgetCategoryCard({ item, onEdit, onDelete, deleteLoading = false }: BudgetCategoryCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{item.category}</h3>
          <p className="text-xs text-slate-500">{item.percentUsed}% used</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColor(item.status)}`}>{item.status}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-700">
        <p>Budget: {formatCurrencyAmount(item.budgetAmount)}</p>
        <p>Actual: {formatCurrencyAmount(item.actualSpent)}</p>
        <p>Pending: {formatCurrencyAmount(item.pendingSpent)}</p>
        <p>Remaining: {formatCurrencyAmount(item.remainingAmount)}</p>
        <p>Forecast: {formatCurrencyAmount(item.forecastedSpend)}</p>
      </div>

      <p className="mt-3 text-sm text-slate-600">{item.explanation}</p>

      <div className="mt-3 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-slate-900" style={{ width: `${Math.min(100, item.percentUsed)}%` }} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onEdit(item)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
          disabled={deleteLoading}
        >
          Edit budget
        </button>
        <button
          type="button"
          onClick={() => onDelete(item)}
          className="rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-700"
          disabled={deleteLoading}
        >
          {deleteLoading ? "Deleting..." : "Delete"}
        </button>
      </div>
    </article>
  );
}
