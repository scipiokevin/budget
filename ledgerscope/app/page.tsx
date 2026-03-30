import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export default async function Home() {
  const session = await auth();

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingCompletedAt: true },
    });

    redirect(user?.onboardingCompletedAt ? "/dashboard" : "/onboarding");
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 sm:px-10">
        <div className="max-w-2xl space-y-6">
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-500 shadow-sm">
            LedgerScope
          </span>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Clear financial visibility for spending, budgets, and synced bank activity.
            </h1>
            <p className="max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Connect accounts, review transactions, monitor budgets, and track financial health from one calm, production-ready workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              Create account
            </Link>
          </div>
          <div className="grid gap-3 pt-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Sync</p>
              <p className="mt-2 text-sm text-slate-700">Bring in Plaid-backed account activity and review it in one place.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Plan</p>
              <p className="mt-2 text-sm text-slate-700">Track budgets, forecast category risk, and monitor month-end outcomes.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Analyze</p>
              <p className="mt-2 text-sm text-slate-700">Review cash flow, recurring charges, insights, and export-ready reporting.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
