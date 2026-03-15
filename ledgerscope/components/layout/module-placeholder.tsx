import type { DataSection } from "@/types/contracts";
import { WidgetCard } from "@/components/ui/widget-card";

type ModulePlaceholderProps = {
  sections: DataSection[];
};

export function ModulePlaceholder({ sections }: ModulePlaceholderProps) {
  const safeSections = Array.isArray(sections) ? sections : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {safeSections.map((section, sectionIndex) => {
        const rows = Array.isArray(section.rows) ? section.rows : [];
        const safeTitle = typeof section.title === "string" && section.title.length > 0 ? section.title : `Section ${sectionIndex + 1}`;

        return (
          <WidgetCard key={`${safeTitle}-${sectionIndex}`} title={safeTitle} description={section.description}>
            <ul className="space-y-2 text-sm text-slate-700">
              {rows.map((row, rowIndex) => (
                <li key={`${safeTitle}-row-${rowIndex}`} className="rounded-md bg-slate-50 px-3 py-2">
                  {row}
                </li>
              ))}
            </ul>
          </WidgetCard>
        );
      })}
    </div>
  );
}
