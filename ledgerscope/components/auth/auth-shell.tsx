import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  subtitle: string;
  footer?: ReactNode;
  children: ReactNode;
};

export function AuthShell({ title, subtitle, footer, children }: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 via-white to-slate-100 p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-6 space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </header>
        {children}
        {footer ? <footer className="mt-5 text-sm text-slate-600">{footer}</footer> : null}
      </section>
    </main>
  );
}
