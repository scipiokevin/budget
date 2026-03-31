"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectBankPanel } from "@/components/plaid/connect-bank-panel";
import type { AppApiError } from "@/types/api-errors";

type OnboardingFormProps = {
  userName?: string | null;
};

export function OnboardingForm({ userName }: OnboardingFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function completeOnboarding() {
    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as AppApiError | null;
      setError(payload?.error ?? "Could not complete onboarding.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 via-white to-slate-100 p-6">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Onboarding</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Welcome{userName ? `, ${userName}` : ""}</h1>
        <p className="mt-3 text-sm text-slate-600">
          Your workspace is ready. Start by securely linking a bank through Plaid so LedgerScope can import transactions,
          build budgets, and keep your dashboard current.
        </p>

        <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-3">
          <div>
            <p className="font-medium text-slate-900">1. Connect accounts</p>
            <p className="mt-1">Use secure Plaid Link to connect bank and card sources for ongoing sync.</p>
          </div>
          <div>
            <p className="font-medium text-slate-900">2. Configure budgets</p>
            <p className="mt-1">Set monthly category targets and alert thresholds.</p>
          </div>
          <div>
            <p className="font-medium text-slate-900">3. Review forecasts</p>
            <p className="mt-1">Monitor projected outcomes and risk categories.</p>
          </div>
        </div>

        <div className="mt-4">
          <ConnectBankPanel />
        </div>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

        <button
          type="button"
          onClick={() => void completeOnboarding()}
          disabled={isSubmitting}
          className="mt-6 rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Finishing..." : "Finish onboarding"}
        </button>
      </section>
    </main>
  );
}
