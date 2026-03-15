import type { ReactNode } from "react";

type WidgetCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function WidgetCard({ title, description, children }: WidgetCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <header className="mb-4 space-y-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</h2>
        {description ? <p className="text-sm text-slate-600">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
