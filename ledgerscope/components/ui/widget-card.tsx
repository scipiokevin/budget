import type { ReactNode } from "react";

type WidgetCardProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
};

export function WidgetCard({ title, description, action, bodyClassName, children }: WidgetCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</h2>
          {description ? <p className="text-sm text-slate-600">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
