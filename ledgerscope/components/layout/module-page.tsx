"use client";

import { useState } from "react";
import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { PageShell } from "@/components/layout/page-shell";
import { type HeaderAction } from "@/components/layout/top-header";
import { DataSurface, EmptyState, ErrorState, LoadingState } from "@/components/ui/data-states";
import { useApiData } from "@/lib/hooks/use-api-data";
import { appApi } from "@/lib/services/app-api-client";
import type { ModuleData } from "@/types/contracts";

type ModuleKey = "income" | "settings" | "business";

type ModulePageProps = {
  moduleKey: ModuleKey;
};

const fetchers: Record<ModuleKey, () => Promise<ModuleData>> = {
  income: appApi.getIncome,
  settings: appApi.getSettings,
  business: appApi.getBusiness,
};

export function ModulePage({ moduleKey }: ModulePageProps) {
  const { data, loading, error, reload } = useApiData(fetchers[moduleKey]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  if (loading) {
    return (
      <PageShell title="Loading" description="Loading module data...">
        <LoadingState label="Loading page content..." />
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell title="Error" description="Unable to load this module.">
        <ErrorState message={error ?? "Request failed."} onRetry={() => void reload()} />
      </PageShell>
    );
  }

  const safeSections = Array.isArray(data.sections) ? data.sections : [];
  const safeActions = Array.isArray(data.actions) ? data.actions : [];
  const safeTitle = typeof data.title === "string" && data.title.length > 0 ? data.title : "Module";
  const safeDescription = typeof data.description === "string" ? data.description : "Data view";

  function handleAction(action: HeaderAction) {
    setActionMessage(`'${action.label}' will be enabled with backend wiring in a follow-up step.`);
    setTimeout(() => setActionMessage(null), 2200);
  }

  return (
    <PageShell title={safeTitle} description={safeDescription} selectedRange={data.selectedRange} actions={safeActions} onActionClick={handleAction}>
      <DataSurface>
        {actionMessage ? <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{actionMessage}</p> : null}
        {safeSections.length === 0 ? (
          <EmptyState title="No data available" detail="Data will appear after your next sync." />
        ) : (
          <ModulePlaceholder sections={safeSections} />
        )}
      </DataSurface>
    </PageShell>
  );
}
