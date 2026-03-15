"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budgets", label: "Budgets" },
  { href: "/insights", label: "Insights" },
  { href: "/income", label: "Income" },
  { href: "/business", label: "Business" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/exports", label: "Exports" },
  { href: "/settings", label: "Settings" },
];

function linkClass(active: boolean) {
  return active
    ? "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
    : "rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100";
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-r border-slate-200 bg-white p-4 md:w-64 md:p-6">
      <div className="mb-6">
        <Link href="/dashboard" className="text-lg font-semibold text-slate-900">
          LedgerScope
        </Link>
        <p className="text-xs text-slate-500">Personal finance workspace</p>
      </div>

      <nav className="hidden flex-col gap-1 md:flex">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={linkClass(isActive)}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <nav className="flex flex-wrap gap-2 md:hidden">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={linkClass(isActive)}>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

