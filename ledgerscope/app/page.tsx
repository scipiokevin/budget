import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function getSessionUserId(): Promise<string | null> {
  try {
    const authModule = await import("@/auth");
    const session = await authModule.auth();
    return session?.user?.id ?? null;
  } catch (error) {
    console.error("Root auth lookup failed", error);
    return null;
  }
}

export default async function Home() {
  const userId = await getSessionUserId();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.16),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-between px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">LedgerScope</p>
            <p className="mt-2 text-sm text-slate-600">Personal finance, budget planning, and transaction intelligence in one calm workspace.</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-slate-800"
            >
              Create account
            </Link>
          </div>
        </header>

        <section className="grid items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div className="space-y-8">
            <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Budgeting + bank sync + smart insights
            </div>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                See your money clearly, act faster, and keep your financial plan on track.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
                LedgerScope connects your accounts, classifies transactions, tracks budgets, and surfaces practical
                insights so you can stay ahead of spending and cash flow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-slate-800"
              >
                Get started
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50"
              >
                Sign in
              </Link>
            </div>

            <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 shadow-sm">
                <p className="font-semibold text-slate-900">Connected accounts</p>
                <p className="mt-1">Plaid-powered syncing keeps balances and transactions current.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 shadow-sm">
                <p className="font-semibold text-slate-900">Budget visibility</p>
                <p className="mt-1">Track category targets, forecast overspend risk, and stay ahead of month-end.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 shadow-sm">
                <p className="font-semibold text-slate-900">Actionable insights</p>
                <p className="mt-1">Spot spending shifts, suspicious charges, and savings opportunities faster.</p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.28)] backdrop-blur">
            <div className="grid gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Monthly snapshot</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
                    <p className="text-xs text-slate-500">Income</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-700">$8,420</p>
                  </div>
                  <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
                    <p className="text-xs text-slate-500">Expenses</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">$5,180</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Budget health</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">Top risk category: Dining</p>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
                    Watch
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">Projected to exceed budget by $62 if current pace continues.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Next step</p>
                <p className="mt-2 text-base font-semibold text-slate-900">Create your account and link a bank securely.</p>
                <p className="mt-2 text-sm text-slate-600">You’ll land in the onboarding flow and can connect Plaid in a few steps.</p>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-slate-200 pt-6 text-sm text-slate-500">
          Built for a calmer, more reliable finance workflow.
        </footer>
      </div>
    </main>
  );
}
