"use client";

import { useMemo, useState } from "react";
import type { ExpenseTag, TransactionPurpose, TransactionRecord } from "@/types/contracts";
import { formatCurrencyAmount } from "@/lib/utils/format";

type TransactionDetailDrawerProps = {
  transaction: TransactionRecord | null;
  open: boolean;
  categories: string[];
  mutationLoading?: boolean;
  mutationError?: string | null;
  mutationSuccess?: string | null;
  onClose: () => void;
  onUpdateCategory: (id: string, category: string) => Promise<void>;
  onUpdatePurpose: (id: string, purpose: TransactionPurpose) => Promise<void>;
  onToggleSuspicious: (id: string, next: boolean) => Promise<void>;
  onAddNote: (id: string, note: string) => Promise<void>;
  onSetExpenseTags: (id: string, tags: ExpenseTag[]) => Promise<void>;
  onSetCustomTags: (id: string, tags: string[]) => Promise<void>;
  onMarkReviewed: (id: string, reviewed: boolean) => Promise<void>;
  onOpenSplit: () => void;
};

const EXPENSE_TAG_OPTIONS: ExpenseTag[] = [
  "vacation",
  "holiday",
  "medical",
  "home repair",
  "wedding",
  "one-time event",
  "business trip",
];

function sourceLabel(source: TransactionRecord["source"]) {
  if (source === "statement_pdf") return "Statement PDF";
  if (source === "manual") return "Manual";
  return "Plaid";
}

export function TransactionDetailDrawer({
  transaction,
  open,
  categories,
  mutationLoading = false,
  mutationError,
  mutationSuccess,
  onClose,
  onUpdateCategory,
  onUpdatePurpose,
  onToggleSuspicious,
  onAddNote,
  onSetExpenseTags,
  onSetCustomTags,
  onMarkReviewed,
  onOpenSplit,
}: TransactionDetailDrawerProps) {
  const [note, setNote] = useState("");
  const [customTagInput, setCustomTagInput] = useState("");

  const safeCategories = useMemo(() => (Array.isArray(categories) ? categories : []), [categories]);

  const normalizedCustomTags = useMemo(() => {
    if (!transaction || !Array.isArray(transaction.customTags)) return [];
    return transaction.customTags;
  }, [transaction]);

  if (!open || !transaction) return null;

  const safeExpenseTags = Array.isArray(transaction.expenseTags) ? transaction.expenseTags : [];
  const safeNotes = Array.isArray(transaction.notes) ? transaction.notes : [];

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{transaction.merchant}</h3>
          <p className="text-sm text-slate-600">{transaction.description}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
          Close
        </button>
      </div>

      {mutationLoading ? <p className="mt-3 text-xs text-slate-500">Saving transaction updates...</p> : null}
      {mutationSuccess ? <p className="mt-3 text-xs text-emerald-700">{mutationSuccess}</p> : null}
      {mutationError ? <p className="mt-3 text-xs text-rose-600">{mutationError}</p> : null}

      <div className="mt-4 space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md bg-slate-50 p-3">Amount: {formatCurrencyAmount(transaction.amount)}</div>
          <div className="rounded-md bg-slate-50 p-3">Date: {transaction.date}</div>
          <div className="rounded-md bg-slate-50 p-3">Source: {sourceLabel(transaction.source)}</div>
          <div className="rounded-md bg-slate-50 p-3">Account: {transaction.account}</div>
        </div>

        <label className="block">
          <span className="text-slate-600">Category</span>
          <select
            value={transaction.category}
            onChange={(e) => void onUpdateCategory(transaction.id, e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            disabled={mutationLoading}
          >
            {safeCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-slate-600">Purpose</span>
          <select
            value={transaction.purpose}
            onChange={(e) => void onUpdatePurpose(transaction.id, e.target.value as TransactionPurpose)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            disabled={mutationLoading}
          >
            <option value="personal">personal</option>
            <option value="business">business</option>
            <option value="split">split</option>
            <option value="uncertain">uncertain</option>
          </select>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onToggleSuspicious(transaction.id, !transaction.isSuspicious)}
            className="rounded-md border border-slate-300 px-3 py-1.5"
            disabled={mutationLoading}
          >
            {transaction.isSuspicious ? "Unflag suspicious" : "Flag suspicious"}
          </button>
          <button
            type="button"
            onClick={() => void onMarkReviewed(transaction.id, transaction.reviewStatus !== "reviewed")}
            className="rounded-md border border-slate-300 px-3 py-1.5"
            disabled={mutationLoading}
          >
            {transaction.reviewStatus === "reviewed" ? "Mark unreviewed" : "Mark reviewed"}
          </button>
          <button
            type="button"
            onClick={onOpenSplit}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-white"
            disabled={mutationLoading}
          >
            Split transaction
          </button>
        </div>

        <div>
          <p className="mb-2 text-slate-600">Unusual expense tags</p>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_TAG_OPTIONS.map((tag) => {
              const selected = safeExpenseTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const nextTags = selected ? safeExpenseTags.filter((value) => value !== tag) : [...safeExpenseTags, tag];
                    void onSetExpenseTags(transaction.id, nextTags);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
                  }`}
                  disabled={mutationLoading}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-slate-600">Custom tags</p>
          {normalizedCustomTags.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {normalizedCustomTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => void onSetCustomTags(transaction.id, normalizedCustomTags.filter((item) => item !== tag))}
                  className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs text-slate-700"
                  disabled={mutationLoading}
                >
                  {tag} x
                </button>
              ))}
            </div>
          ) : (
            <p className="mb-2 text-xs text-slate-500">No custom tags yet.</p>
          )}
          <div className="flex gap-2">
            <input
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              placeholder="Add custom tag"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={mutationLoading}
            />
            <button
              type="button"
              onClick={() => {
                const nextTag = customTagInput.trim();
                if (!nextTag) return;
                const nextTags = [...new Set([...normalizedCustomTags, nextTag])];
                void onSetCustomTags(transaction.id, nextTags);
                setCustomTagInput("");
              }}
              className="rounded-md bg-slate-900 px-3 py-2 text-white"
              disabled={mutationLoading}
            >
              Add
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-slate-600">Notes</p>
          <ul className="space-y-2">
            {safeNotes.length === 0 ? (
              <li className="rounded-md bg-slate-50 px-3 py-2 text-slate-500">No notes yet.</li>
            ) : (
              safeNotes.map((item) => (
                <li key={item} className="rounded-md bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))
            )}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              disabled={mutationLoading}
            />
            <button
              type="button"
              onClick={() => {
                if (!note.trim()) return;
                void onAddNote(transaction.id, note.trim());
                setNote("");
              }}
              className="rounded-md bg-slate-900 px-3 py-2 text-white"
              disabled={mutationLoading}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
