import type { ReactNode } from "react";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
      <div className="space-y-3">
        <p>{label}</p>
        <div className="animate-pulse space-y-2">
          <div className="h-2.5 w-1/3 rounded bg-slate-200" />
          <div className="h-2.5 w-full rounded bg-slate-200" />
          <div className="h-2.5 w-5/6 rounded bg-slate-200" />
        </div>
      </div>
    </section>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 shadow-sm">
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md bg-rose-700 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150 hover:bg-rose-800"
        >
          Retry
        </button>
      ) : null}
    </section>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {detail ? <p className="mt-1 text-sm text-slate-500">{detail}</p> : null}
    </section>
  );
}

export function DataSurface({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}
