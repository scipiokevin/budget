import { CashFlowType, ExportFormat, ExportMode, ExportScope, ExportStatus, Prisma, TransactionPurpose, TransactionStatus } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import type {
  ExportCreatePayload,
  ExportCreateResponse,
  ExportPreview,
  ExportRollupItem,
  ExportRunItem,
  ExportsData,
  ExportTransactionRow,
  ExportScope as UiExportScope,
} from "@/types/contracts";

const TRIP_TAG_FILTERS = ["TAG:vacation", "TAG:holiday", "TAG:business trip"];

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function normalizeScope(scope: UiExportScope): ExportScope {
  if (scope === "personal_only") return ExportScope.PERSONAL_ONLY;
  if (scope === "business_only") return ExportScope.BUSINESS_ONLY;
  if (scope === "trip_tagged") return ExportScope.TRIP_TAGGED;
  return ExportScope.ALL;
}

function normalizeMode(mode: ExportCreatePayload["mode"]): ExportMode {
  if (mode === "summary_only") return ExportMode.SUMMARY_ONLY;
  if (mode === "itemized_only") return ExportMode.ITEMIZED_ONLY;
  return ExportMode.SUMMARY_AND_ITEMIZED;
}

function normalizeFormat(format: ExportCreatePayload["format"]): ExportFormat {
  if (format === "xlsx") return ExportFormat.XLSX;
  if (format === "pdf") return ExportFormat.PDF;
  return ExportFormat.CSV;
}

function mapRun(run: {
  id: string;
  format: ExportFormat;
  mode: ExportMode;
  scope: ExportScope;
  status: ExportStatus;
  rowCount: number | null;
  totalAmount: Prisma.Decimal | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): ExportRunItem {
  return {
    id: run.id,
    format: run.format.toLowerCase() as ExportRunItem["format"],
    mode: run.mode.toLowerCase() as ExportRunItem["mode"],
    scope: run.scope.toLowerCase() as ExportRunItem["scope"],
    status: run.status.toLowerCase() as ExportRunItem["status"],
    rowCount: run.rowCount ?? undefined,
    totalAmount: run.totalAmount ? toNumber(run.totalAmount) : undefined,
    errorMessage: run.errorMessage ?? undefined,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString(),
    downloadUrl: run.status === ExportStatus.COMPLETED ? `/api/exports?id=${run.id}&download=1` : undefined,
  };
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function topRollups(map: Map<string, { amount: number; count: number }>): ExportRollupItem[] {
  return [...map.entries()]
    .map(([key, value]) => ({ key, amount: Number(value.amount.toFixed(2)), count: value.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 12);
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function buildCsv(preview: ExportPreview): string {
  const lines: string[] = [];
  lines.push("Summary Total,Itemized Total,Reconciled,Row Count");
  lines.push(`${preview.summaryTotal.toFixed(2)},${preview.itemizedTotal.toFixed(2)},${preview.reconciled},${preview.rowCount}`);
  lines.push("");

  lines.push("Itemized Transactions");
  lines.push("Date,Merchant,Category,Purpose,Amount");
  for (const row of preview.itemized) {
    lines.push(
      [row.date, csvEscape(row.merchant), csvEscape(row.category), row.purpose, row.amount.toFixed(2)].join(","),
    );
  }

  lines.push("");
  lines.push("Category Rollups");
  lines.push("Category,Amount,Count");
  for (const row of preview.categoryRollups) {
    lines.push(`${csvEscape(row.key)},${row.amount.toFixed(2)},${row.count}`);
  }

  lines.push("");
  lines.push("Merchant Rollups");
  lines.push("Merchant,Amount,Count");
  for (const row of preview.merchantRollups) {
    lines.push(`${csvEscape(row.key)},${row.amount.toFixed(2)},${row.count}`);
  }

  lines.push("");
  lines.push("Monthly Rollups");
  lines.push("Month,Amount,Count");
  for (const row of preview.monthlyRollups) {
    lines.push(`${row.key},${row.amount.toFixed(2)},${row.count}`);
  }

  return lines.join("\n");
}

function buildExcelCompatibleTsv(preview: ExportPreview): string {
  const lines: string[] = [];
  lines.push("Date\tMerchant\tCategory\tPurpose\tAmount");
  for (const row of preview.itemized) {
    lines.push([row.date, row.merchant, row.category, row.purpose, row.amount.toFixed(2)].join("\t"));
  }
  lines.push("");
  lines.push(`Summary Total\t${preview.summaryTotal.toFixed(2)}`);
  lines.push(`Itemized Total\t${preview.itemizedTotal.toFixed(2)}`);
  lines.push(`Reconciled\t${preview.reconciled}`);
  return lines.join("\n");
}

function buildPdfSummaryText(preview: ExportPreview): string {
  const lines: string[] = [];
  lines.push("LedgerScope Export Summary Report");
  lines.push("");
  lines.push(`Summary total: $${preview.summaryTotal.toFixed(2)}`);
  lines.push(`Itemized total: $${preview.itemizedTotal.toFixed(2)}`);
  lines.push(`Reconciled: ${preview.reconciled}`);
  lines.push(`Rows: ${preview.rowCount}`);
  lines.push("");
  lines.push("Top Category Rollups:");
  preview.categoryRollups.slice(0, 8).forEach((row) => lines.push(`- ${row.key}: $${row.amount.toFixed(2)} (${row.count})`));
  lines.push("");
  lines.push("Top Merchant Rollups:");
  preview.merchantRollups.slice(0, 8).forEach((row) => lines.push(`- ${row.key}: $${row.amount.toFixed(2)} (${row.count})`));
  return lines.join("\n");
}

async function buildPreview(userId: string, payload: ExportCreatePayload): Promise<ExportPreview> {
  const where: Prisma.TransactionWhereInput = {
    userId,
    status: { not: TransactionStatus.REMOVED },
    cashFlowType: CashFlowType.EXPENSE,
  };

  if (payload.scope === "personal_only") where.purpose = TransactionPurpose.PERSONAL;
  if (payload.scope === "business_only") where.purpose = TransactionPurpose.BUSINESS;

  if (payload.dateFrom || payload.dateTo) {
    where.date = {};
    if (payload.dateFrom) where.date.gte = new Date(payload.dateFrom);
    if (payload.dateTo) where.date.lte = new Date(payload.dateTo);
  }

  if (payload.scope === "trip_tagged") {
    where.notes = {
      some: {
        note: { in: TRIP_TAG_FILTERS },
      },
    };
  }

  const rows = await prisma.transaction.findMany({
    where,
    select: {
      id: true,
      date: true,
      merchantRaw: true,
      merchantNormalized: true,
      categoryPrimary: true,
      purpose: true,
      amount: true,
    },
    orderBy: { date: "desc" },
  });

  const itemized: ExportTransactionRow[] = rows.map((row) => ({
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    merchant: row.merchantRaw ?? row.merchantNormalized ?? "Unknown merchant",
    category: row.categoryPrimary ?? "Uncategorized",
    purpose: row.purpose.toLowerCase() as ExportTransactionRow["purpose"],
    amount: Number(toNumber(row.amount).toFixed(2)),
  }));

  const categoryMap = new Map<string, { amount: number; count: number }>();
  const merchantMap = new Map<string, { amount: number; count: number }>();
  const monthMap = new Map<string, { amount: number; count: number }>();

  for (const row of rows) {
    const amount = toNumber(row.amount);
    const category = row.categoryPrimary ?? "Uncategorized";
    const merchant = row.merchantRaw ?? row.merchantNormalized ?? "Unknown merchant";
    const month = monthKey(row.date);

    const c = categoryMap.get(category) ?? { amount: 0, count: 0 };
    c.amount += amount; c.count += 1; categoryMap.set(category, c);

    const m = merchantMap.get(merchant) ?? { amount: 0, count: 0 };
    m.amount += amount; m.count += 1; merchantMap.set(merchant, m);

    const mm = monthMap.get(month) ?? { amount: 0, count: 0 };
    mm.amount += amount; mm.count += 1; monthMap.set(month, mm);
  }

  const summaryTotal = Number([...categoryMap.values()].reduce((sum, x) => sum + x.amount, 0).toFixed(2));
  const itemizedTotal = Number(itemized.reduce((sum, x) => sum + x.amount, 0).toFixed(2));

  return {
    summaryTotal,
    itemizedTotal,
    reconciled: Math.abs(summaryTotal - itemizedTotal) < 0.01,
    rowCount: itemized.length,
    categoryRollups: topRollups(categoryMap),
    merchantRollups: topRollups(merchantMap),
    monthlyRollups: topRollups(monthMap),
    itemized,
  };
}

function extensionForFormat(format: ExportCreatePayload["format"]): string {
  if (format === "pdf") return "pdf";
  if (format === "xlsx") return "xlsx";
  return "csv";
}

export async function getExportsDataFromPrisma(userId: string): Promise<ExportsData> {
  const runs = await prisma.exportRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    title: "Exports",
    description: "Generate reconciled transaction exports with rollups.",
    selectedRange: "Custom",
    actions: [
      { label: "Create Export", variant: "primary" },
      { label: "Refresh", variant: "secondary" },
    ],
    recentRuns: runs.map(mapRun),
  };
}

export async function createExportInPrisma(userId: string, payload: ExportCreatePayload): Promise<ExportCreateResponse> {
  const run = await prisma.exportRun.create({
    data: {
      userId,
      format: normalizeFormat(payload.format),
      mode: normalizeMode(payload.mode),
      scope: normalizeScope(payload.scope),
      periodStart: payload.dateFrom ? new Date(payload.dateFrom) : null,
      periodEnd: payload.dateTo ? new Date(payload.dateTo) : null,
      status: ExportStatus.PROCESSING,
    },
  });

  try {
    const preview = await buildPreview(userId, payload);
    const ext = extensionForFormat(payload.format);
    const exportDir = path.join(process.cwd(), "tmp", "exports");
    await fs.mkdir(exportDir, { recursive: true });
    const filePath = path.join(exportDir, `${run.id}.${ext}`);

    const content =
      payload.format === "csv"
        ? buildCsv(preview)
        : payload.format === "xlsx"
          ? buildExcelCompatibleTsv(preview)
          : buildPdfSummaryText(preview);

    await fs.writeFile(filePath, content, "utf8");

    const updated = await prisma.exportRun.update({
      where: { id: run.id },
      data: {
        status: ExportStatus.COMPLETED,
        filePath,
        rowCount: preview.rowCount,
        totalAmount: preview.itemizedTotal,
        completedAt: new Date(),
      },
    });

    return {
      run: mapRun(updated),
      preview,
    };
  } catch (error) {
    await prisma.exportRun.update({
      where: { id: run.id },
      data: {
        status: ExportStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Export generation failed.",
      },
    });

    throw error;
  }
}

export async function getExportDownload(userId: string, id: string): Promise<{ content: string; filename: string; contentType: string } | null> {
  const run = await prisma.exportRun.findFirst({
    where: { id, userId },
    select: { id: true, format: true, filePath: true, status: true },
  });

  if (!run || run.status !== ExportStatus.COMPLETED || !run.filePath) return null;

  const content = await fs.readFile(run.filePath, "utf8");
  const filename = `ledger-export-${run.id}.${run.format.toLowerCase()}`;
  const contentType =
    run.format === ExportFormat.CSV
      ? "text/csv; charset=utf-8"
      : run.format === ExportFormat.XLSX
        ? "application/vnd.ms-excel; charset=utf-8"
        : "text/plain; charset=utf-8";

  return { content, filename, contentType };
}