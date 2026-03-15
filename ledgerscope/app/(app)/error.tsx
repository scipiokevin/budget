"use client";

import { useEffect } from "react";
import { PageShell } from "@/components/layout/page-shell";

export default function AppRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface runtime errors in dev tools while keeping the UI recoverable.
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <PageShell title="Something went wrong" description="This page hit a client-side error.">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 shadow-sm">
        <p className="font-medium">Unable to render this page right now.</p>
        <p className="mt-1">Try reloading the page. If the issue continues, use Retry below.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-slate-800"
        >
          Retry
        </button>
      </div>
    </PageShell>
  );
}
