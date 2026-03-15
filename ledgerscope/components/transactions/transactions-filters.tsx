"use client";

import type { TransactionsData, TransactionsQuery } from "@/types/contracts";

type TransactionsFiltersProps = {
  query: TransactionsQuery;
  filterOptions: TransactionsData["filterOptions"];
  onChange: (next: Partial<TransactionsQuery>) => void;
  onApply: () => void;
  onReset: () => void;
};

export function TransactionsFilters({ query, filterOptions, onChange, onApply, onReset }: TransactionsFiltersProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input
          value={query.search ?? ""}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Search merchant or description"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={query.dateFrom ?? ""}
          onChange={(e) => onChange({ dateFrom: e.target.value || undefined })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={query.dateTo ?? ""}
          onChange={(e) => onChange({ dateTo: e.target.value || undefined })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={query.merchant ?? ""}
          onChange={(e) => onChange({ merchant: e.target.value || undefined })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All merchants</option>
          {filterOptions.merchants.map((merchant) => (
            <option key={merchant} value={merchant}>
              {merchant}
            </option>
          ))}
        </select>

        <select
          value={query.category ?? ""}
          onChange={(e) => onChange({ category: e.target.value || undefined })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {filterOptions.categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <select
          value={query.account ?? ""}
          onChange={(e) => onChange({ account: e.target.value || undefined })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All accounts</option>
          {filterOptions.accounts.map((account) => (
            <option key={account} value={account}>
              {account}
            </option>
          ))}
        </select>

        <select
          value={query.purpose ?? ""}
          onChange={(e) => onChange({ purpose: (e.target.value as TransactionsQuery["purpose"]) || undefined })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All purpose labels</option>
          {filterOptions.purposes.map((purpose) => (
            <option key={purpose} value={purpose}>
              {purpose}
            </option>
          ))}
        </select>

        <select
          value={query.status ?? ""}
          onChange={(e) => onChange({ status: (e.target.value as TransactionsQuery["status"]) || undefined })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {filterOptions.statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <input
          type="number"
          value={query.amountMin ?? ""}
          onChange={(e) => onChange({ amountMin: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="Amount min"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={query.amountMax ?? ""}
          onChange={(e) => onChange({ amountMax: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="Amount max"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onApply}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Apply filters
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
        >
          Reset
        </button>
      </div>
    </section>
  );
}
