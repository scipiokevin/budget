import type { ReactNode } from "react";
import { TopHeader, type HeaderAction } from "@/components/layout/top-header";

type PageShellProps = {
  title: string;
  description?: string;
  selectedRange?: string;
  rangeOptions?: string[];
  actions?: HeaderAction[];
  onActionClick?: (action: HeaderAction) => void;
  children?: ReactNode;
};

export function PageShell({
  title,
  description,
  selectedRange,
  rangeOptions,
  actions,
  onActionClick,
  children,
}: PageShellProps) {
  return (
    <main className="space-y-8 p-7 md:p-10">
      <TopHeader
        title={title}
        description={description}
        selectedRange={selectedRange}
        rangeOptions={rangeOptions}
        actions={actions}
        onActionClick={onActionClick}
      />
      {children}
    </main>
  );
}
