"use client";

import { useState } from "react";
import type { SplitMethod, TransactionRecord } from "@/types/contracts";
import { formatCurrencyAmount } from "@/lib/utils/format";

type SplitTransactionModalProps = {
  open: boolean;
  transaction: TransactionRecord | null;
  onClose: () => void;
  onSubmit: (payload: {
    method: SplitMethod;
    personalAmount: number;
    businessAmount: number;
    personalPercent?: number;
    businessPercent?: number;
  }) => Promise<void>;
};

export function SplitTransactionModal({ open, transaction, onClose, onSubmit }: SplitTransactionModalProps) {
  const [method, setMethod] = useState<SplitMethod>("percentage");
  const [personalPercent, setPersonalPercent] = useState(50);
  const [businessPercent, setBusinessPercent] = useState(50);
  const [personalAmount, setPersonalAmount] = useState(0);
  const [businessAmount, setBusinessAmount] = useState(0);

  if (!open || !transaction) return null;

  async function handleSubmit() {
    const active = transaction;
    if (!active) return;

    if (method === "percentage") {
      const total = active.amount;
      const personal = Number(((total * personalPercent) / 100).toFixed(2));
      const business = Number((total - personal).toFixed(2));
      await onSubmit({
        method,
        personalAmount: personal,
        businessAmount: business,
        personalPercent,
        businessPercent,
      });
      onClose();
      return;
    }

    await onSubmit({
      method,
      personalAmount,
      businessAmount,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Split Transaction</h3>
        <p className="mt-1 text-sm text-slate-600">
          {transaction.merchant} - {formatCurrencyAmount(transaction.amount)}
        </p>

        <div className="mt-4 flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMethod("percentage")}
            className={`rounded-md px-3 py-1.5 ${method === "percentage" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"}`}
          >
            Percentage
          </button>
          <button
            type="button"
            onClick={() => setMethod("amount")}
            className={`rounded-md px-3 py-1.5 ${method === "amount" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"}`}
          >
            Amount
          </button>
        </div>

        {method === "percentage" ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-600">
              Personal %
              <input
                type="number"
                value={personalPercent}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setPersonalPercent(value);
                  setBusinessPercent(Math.max(0, 100 - value));
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm text-slate-600">
              Business %
              <input
                type="number"
                value={businessPercent}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setBusinessPercent(value);
                  setPersonalPercent(Math.max(0, 100 - value));
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-600">
              Personal amount
              <input
                type="number"
                value={personalAmount}
                onChange={(e) => setPersonalAmount(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm text-slate-600">
              Business amount
              <input
                type="number"
                value={businessAmount}
                onChange={(e) => setBusinessAmount(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button type="button" onClick={() => void handleSubmit()} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white">
            Save split
          </button>
        </div>
      </div>
    </div>
  );
}

