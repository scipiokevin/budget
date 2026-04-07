"use client";

import type { TransactionRecord } from "@/types/contracts";
import { formatCurrencyAmount } from "@/lib/utils/format";

function purposeBadgeClass(purpose: TransactionRecord["purpose"]) {
  if (purpose === "business") return "bg-sky-50 text-sky-700 border-sky-200";
  if (purpose === "personal") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (purpose === "split") return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function statusBadgeClass(status: TransactionRecord["status"]) {
  return status === "posted" ? "bg-slate-100 text-slate-700 border-slate-200" : "bg-amber-50 text-amber-700 border-amber-200";
}

function reviewedBadgeClass(reviewStatus: TransactionRecord["reviewStatus"]) {
  return reviewStatus === "reviewed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-700 border-slate-200";
}

function suspiciousBadgeClass(isSuspicious: boolean) {
  return isSuspicious ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-100 text-slate-700 border-slate-200";
}

function sourceBadgeClass(source: TransactionRecord["source"]) {
  if (source === "statement_pdf") return "bg-amber-50 text-amber-700 border-amber-200";
  if (source === "manual") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function sourceLabel(source: TransactionRecord["source"]) {
  if (source === "statement_pdf") return "Statement PDF";
  if (source === "manual") return "Manual";
  return "Plaid";
}

function categoryToken(category: string) {
  const normalized = category.trim();
  if (!normalized) return "?";
  return normalized.slice(0, 1).toUpperCase();
}

type TransactionsTableProps = {
  items: TransactionRecord[];
  page: number;
  totalPages: number;
  totalCount: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onSelect: (item: TransactionRecord) => void;
};

export function TransactionsTable({
  items,
  page,
  totalPages,
  totalCount,
  loading = false,
  onPageChange,
  onSelect,
}: TransactionsTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Merchant</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Tags</th>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Purpose</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Reviewed</th>
              <th className="px-4 py-3 font-medium">Suspicious</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 transition-colors duration-150 hover:bg-slate-50/80">
                <td className="px-4 py-4 text-xs text-slate-600">{item.date}</td>
                <td className="px-4 py-4">
                  <div className="text-[15px] font-semibold tracking-tight text-slate-900">{item.merchant}</div>
                  <div className="max-w-[18rem] truncate text-xs text-slate-500">{item.description}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
                      {categoryToken(item.category)}
                    </span>
                    <span className="text-slate-700">{item.category}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  {item.expenseTags.length === 0 && item.customTags.length === 0 ? (
                    <span className="text-xs text-slate-500">No tags</span>
                  ) : (
                    <div className="flex max-w-[18rem] flex-wrap gap-1">
                      {item.expenseTags.map((tag) => (
                        <span key={`${item.id}-expense-${tag}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-700">
                          {tag}
                        </span>
                      ))}
                      {item.customTags.map((tag) => (
                        <span key={`${item.id}-custom-${tag}`} className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-sky-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 text-xs text-slate-600">{item.account}</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${sourceBadgeClass(item.source)}`}>
                    {sourceLabel(item.source)}
                  </span>
                </td>
                <td className="px-4 py-4 text-right text-[15px] font-semibold tracking-tight text-slate-900">{formatCurrencyAmount(item.amount)}</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${purposeBadgeClass(item.purpose)}`}>
                    {item.purpose}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${statusBadgeClass(item.status)}`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${reviewedBadgeClass(item.reviewStatus)}`}>
                    {item.reviewStatus}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${suspiciousBadgeClass(item.isSuspicious)}`}>
                    {item.isSuspicious ? "Flagged" : "Clear"}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50"
                    disabled={loading}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
        <p>
          Page {page} of {totalPages} - {totalCount} total
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg border border-slate-300 px-2 py-1 transition-colors duration-150 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={loading || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="rounded-lg border border-slate-300 px-2 py-1 transition-colors duration-150 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
