import type { BudgetAlert } from "@/types/contracts";

type BudgetAlertsSectionProps = {
  alerts: BudgetAlert[];
};

function alertStyle(type: BudgetAlert["type"]) {
  switch (type) {
    case "threshold_100":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "projected_over_budget":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

export function BudgetAlertsSection({ alerts }: BudgetAlertsSectionProps) {
  const safeAlerts = Array.isArray(alerts) ? alerts : [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Recent alerts</h3>
      <div className="mt-3 space-y-2">
        {safeAlerts.length === 0 ? (
          <p className="text-sm text-slate-500">No recent budget alerts.</p>
        ) : (
          safeAlerts.map((alert) => (
            <article key={alert.id} className={`rounded-md border px-3 py-2 text-sm ${alertStyle(alert.type)}`}>
              <p className="font-medium">{alert.category}</p>
              <p>{alert.message}</p>
              <p className="text-xs opacity-80">{alert.createdAt}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
