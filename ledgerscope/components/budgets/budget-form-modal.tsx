"use client";

import { useEffect, useState } from "react";
import type { BudgetCategorySnapshot, BudgetUpsertPayload } from "@/types/contracts";

type BudgetFormModalProps = {
  open: boolean;
  initial?: BudgetCategorySnapshot | null;
  onClose: () => void;
  onSubmit: (payload: BudgetUpsertPayload) => Promise<void>;
};

export function BudgetFormModal({ open, initial, onClose, onSubmit }: BudgetFormModalProps) {
  const [category, setCategory] = useState("");
  const [budgetAmount, setBudgetAmount] = useState(0);
  const [actualSpent, setActualSpent] = useState(0);
  const [pendingSpent, setPendingSpent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory(initial?.category ?? "");
    setBudgetAmount(initial?.budgetAmount ?? 0);
    setActualSpent(initial?.actualSpent ?? 0);
    setPendingSpent(initial?.pendingSpent ?? 0);
    setSubmitting(false);
  }, [open, initial]);

  if (!open) return null;

  async function handleSave() {
    setSubmitting(true);

    try {
      await onSubmit({
        id: initial?.id,
        category,
        budgetAmount,
        actualSpent,
        pendingSpent,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{initial ? "Edit budget" : "Create budget"}</h3>
        <div className="mt-4 space-y-3">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={submitting}
          />
          <input
            type="number"
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(Number(e.target.value))}
            placeholder="Budget amount"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={submitting}
          />
          <input
            type="number"
            value={actualSpent}
            onChange={(e) => setActualSpent(Number(e.target.value))}
            placeholder="Actual spent"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={submitting}
          />
          <input
            type="number"
            value={pendingSpent}
            onChange={(e) => setPendingSpent(Number(e.target.value))}
            placeholder="Pending spent"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={submitting}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
