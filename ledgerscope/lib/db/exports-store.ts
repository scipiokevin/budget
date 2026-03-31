import { prisma } from "@/lib/db/prisma";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as XLSX from "xlsx";
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

type DecimalLike = { toString(): string };
type PrismaCashFlowType = "INCOME" | "EXPENSE" | "TRANSFER" | "REFUND" | "REIMBURSEMENT" | "ADJUSTMENT";
type PrismaExportFormat = "CSV" | "XLSX" | "PDF";
type PrismaExportMode = "SUMMARY_ONLY" | "ITEMIZED_ONLY" | "SUMMARY_AND_ITEMIZED";
type PrismaExportScope = "ALL" | "PERSONAL_ONLY" | "BUSINESS_ONLY" | "TRIP_TAGGED";
type PrismaExportStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
type PrismaTransactionPurpose = "PERSONAL" | "BUSINESS" | "SPLIT" | "UNCERTAIN";
type PrismaTransactionStatus = "PENDING" | "POSTED" | "REMOVED";
type TransactionWhere = {
  userId: string;
  status: { not: PrismaTransactionStatus };
  cashFlowType: PrismaCashFlowType;
  purpose?: PrismaTransactionPurpose;
  date?: {
    gte?: Date;
    lte?: Date;
  };
  notes?: {
    some: {
      note: {
        in: string[];
      };
    };
  };
};
type ExportRunRow = {
  id: string;
  format: PrismaExportFormat;
  mode: PrismaExportMode;
  scope: PrismaExportScope;
  status: PrismaExportStatus;
  rowCount: number | null;
  totalAmount: DecimalLike | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
};
type ExportTransactionDbRow = {
  id: string;
  date: Date;
  merchantRaw: string | null;
  merchantNormalized: string | null;
  categoryPrimary: string | null;
  purpose: PrismaTransactionPurpose;
  amount: DecimalLike | number | null;
};
type ExportDownloadRow = {
  id: string;
  format: PrismaExportFormat;
  mode: PrismaExportMode;
  scope: PrismaExportScope;
  periodStart: Date | null;
  periodEnd: Date | null;
  status: PrismaExportStatus;
};

type ExportFile = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

const CASH_FLOW_TYPE = {
  EXPENSE: "EXPENSE",
} as const satisfies Record<string, PrismaCashFlowType>;

const EXPORT_FORMAT = {
  CSV: "CSV",
  XLSX: "XLSX",
  PDF: "PDF",
} as const satisfies Record<string, PrismaExportFormat>;

const EXPORT_MODE = {
  SUMMARY_ONLY: "SUMMARY_ONLY",
  ITEMIZED_ONLY: "ITEMIZED_ONLY",
  SUMMARY_AND_ITEMIZED: "SUMMARY_AND_ITEMIZED",
} as const satisfies Record<string, PrismaExportMode>;

const EXPORT_SCOPE = {
  ALL: "ALL",
  PERSONAL_ONLY: "PERSONAL_ONLY",
  BUSINESS_ONLY: "BUSINESS_ONLY",
  TRIP_TAGGED: "TRIP_TAGGED",
} as const satisfies Record<string, PrismaExportScope>;

const EXPORT_STATUS = {
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const satisfies Record<string, PrismaExportStatus>;

const TRANSACTION_PURPOSE = {
  PERSONAL: "PERSONAL",
  BUSINESS: "BUSINESS",
} as const satisfies Record<string, PrismaTransactionPurpose>;

const TRANSACTION_STATUS = {
  REMOVED: "REMOVED",
} as const satisfies Record<string, PrismaTransactionStatus>;

function toNumber(value: DecimalLike | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function normalizeScope(scope: UiExportScope): PrismaExportScope {
  if (scope === "personal_only") return EXPORT_SCOPE.PERSONAL_ONLY;
  if (scope === "business_only") return EXPORT_SCOPE.BUSINESS_ONLY;
  if (scope === "trip_tagged") return EXPORT_SCOPE.TRIP_TAGGED;
  return EXPORT_SCOPE.ALL;
}

function normalizeMode(mode: ExportCreatePayload["mode"]): PrismaExportMode {
  if (mode === "summary_only") return EXPORT_MODE.SUMMARY_ONLY;
  if (mode === "itemized_only") return EXPORT_MODE.ITEMIZED_ONLY;
  return EXPORT_MODE.SUMMARY_AND_ITEMIZED;
}

function normalizeFormat(format: ExportCreatePayload["format"]): PrismaExportFormat {
  if (format === "xlsx") return EXPORT_FORMAT.XLSX;
  if (format === "pdf") return EXPORT_FORMAT.PDF;
  return EXPORT_FORMAT.CSV;
}

function mapRun(run: ExportRunRow): ExportRunItem {
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
    downloadUrl: run.status === EXPORT_STATUS.COMPLETED ? `/api/exports?id=${run.id}&download=1` : undefined,
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

function logExport(stage: string, detail: Record<string, unknown>) {
  console.info("[exports]", JSON.stringify({ stage, timestamp: new Date().toISOString(), ...detail }));
}

function logExportError(stage: string, detail: Record<string, unknown>) {
  console.error("[exports]", JSON.stringify({ stage, timestamp: new Date().toISOString(), ...detail }));
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

function buildXlsx(preview: ExportPreview): Buffer {
  const workbook = XLSX.utils.book_new();

  const itemizedSheet = XLSX.utils.json_to_sheet(
    preview.itemized.map((row) => ({
      Date: row.date,
      Merchant: row.merchant,
      Category: row.category,
      Purpose: row.purpose,
      Amount: row.amount,
    })),
  );

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Metric", "Value"],
    ["Summary Total", preview.summaryTotal],
    ["Itemized Total", preview.itemizedTotal],
    ["Reconciled", preview.reconciled ? "Yes" : "No"],
    ["Row Count", preview.rowCount],
  ]);

  const categorySheet = XLSX.utils.json_to_sheet(
    preview.categoryRollups.map((row) => ({
      Category: row.key,
      Amount: row.amount,
      Count: row.count,
    })),
  );

  const merchantSheet = XLSX.utils.json_to_sheet(
    preview.merchantRollups.map((row) => ({
      Merchant: row.key,
      Amount: row.amount,
      Count: row.count,
    })),
  );

  const monthlySheet = XLSX.utils.json_to_sheet(
    preview.monthlyRollups.map((row) => ({
      Month: row.key,
      Amount: row.amount,
      Count: row.count,
    })),
  );

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, itemizedSheet, "Itemized");
  XLSX.utils.book_append_sheet(workbook, categorySheet, "Categories");
  XLSX.utils.book_append_sheet(workbook, merchantSheet, "Merchants");
  XLSX.utils.book_append_sheet(workbook, monthlySheet, "Monthly");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function buildPdf(preview: ExportPreview): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);

  let y = 750;
  const left = 48;

  function drawLine(text: string, options?: { bold?: boolean; size?: number }) {
    const size = options?.size ?? 11;
    page.drawText(text, {
      x: left,
      y,
      size,
      font: options?.bold ? boldFont : font,
    });
    y -= size + 8;
  }

  drawLine("LedgerScope Export Summary Report", { bold: true, size: 18 });
  y -= 4;
  drawLine(`Summary total: $${preview.summaryTotal.toFixed(2)}`);
  drawLine(`Itemized total: $${preview.itemizedTotal.toFixed(2)}`);
  drawLine(`Reconciled: ${preview.reconciled ? "Yes" : "No"}`);
  drawLine(`Row count: ${preview.rowCount}`);
  y -= 6;
  drawLine("Top Category Rollups", { bold: true });
  preview.categoryRollups.slice(0, 8).forEach((row) => {
    drawLine(`- ${row.key}: $${row.amount.toFixed(2)} (${row.count})`);
  });
  y -= 6;
  drawLine("Top Merchant Rollups", { bold: true });
  preview.merchantRollups.slice(0, 8).forEach((row) => {
    drawLine(`- ${row.key}: $${row.amount.toFixed(2)} (${row.count})`);
  });

  return document.save();
}

async function buildPreview(userId: string, payload: ExportCreatePayload): Promise<ExportPreview> {
  const where: TransactionWhere = {
    userId,
    status: { not: TRANSACTION_STATUS.REMOVED },
    cashFlowType: CASH_FLOW_TYPE.EXPENSE,
  };

  if (payload.scope === "personal_only") where.purpose = TRANSACTION_PURPOSE.PERSONAL;
  if (payload.scope === "business_only") where.purpose = TRANSACTION_PURPOSE.BUSINESS;

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

  const rows: ExportTransactionDbRow[] = await prisma.transaction.findMany({
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

function payloadFromRun(run: ExportDownloadRow): ExportCreatePayload {
  return {
    format: run.format.toLowerCase() as ExportCreatePayload["format"],
    mode: run.mode.toLowerCase() as ExportCreatePayload["mode"],
    scope: run.scope.toLowerCase() as ExportCreatePayload["scope"],
    dateFrom: run.periodStart?.toISOString().slice(0, 10),
    dateTo: run.periodEnd?.toISOString().slice(0, 10),
  };
}

async function buildExportFile(runId: string, preview: ExportPreview, payload: ExportCreatePayload): Promise<ExportFile> {
  const extension = extensionForFormat(payload.format);
  const filename = `ledger-export-${runId}.${extension}`;

  if (payload.format === "csv") {
    return {
      buffer: Buffer.from(buildCsv(preview), "utf8"),
      filename,
      contentType: "text/csv; charset=utf-8",
    };
  }

  if (payload.format === "xlsx") {
    return {
      buffer: buildXlsx(preview),
      filename,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  return {
    buffer: Buffer.from(await buildPdf(preview)),
    filename,
    contentType: "application/pdf",
  };
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
  logExport("create.start", {
    userId,
    format: payload.format,
    mode: payload.mode,
    scope: payload.scope,
    dateFrom: payload.dateFrom ?? undefined,
    dateTo: payload.dateTo ?? undefined,
  });

  const run = await prisma.exportRun.create({
    data: {
      userId,
      format: normalizeFormat(payload.format),
      mode: normalizeMode(payload.mode),
      scope: normalizeScope(payload.scope),
      periodStart: payload.dateFrom ? new Date(payload.dateFrom) : null,
      periodEnd: payload.dateTo ? new Date(payload.dateTo) : null,
      status: EXPORT_STATUS.PROCESSING,
    },
  });

  try {
    const preview = await buildPreview(userId, payload);
    await buildExportFile(run.id, preview, payload);

    const updated = await prisma.exportRun.update({
      where: { id: run.id },
      data: {
        status: EXPORT_STATUS.COMPLETED,
        filePath: null,
        rowCount: preview.rowCount,
        totalAmount: preview.itemizedTotal,
        completedAt: new Date(),
      },
    });

    logExport("create.complete", {
      userId,
      exportRunId: run.id,
      format: payload.format,
      rows: preview.rowCount,
      totalAmount: preview.itemizedTotal,
      storage: "memory",
    });

    return {
      run: mapRun(updated),
      preview,
    };
  } catch (error) {
    logExportError("create.error", {
      userId,
      exportRunId: run.id,
      format: payload.format,
      error: error instanceof Error ? error.message : "Unknown export generation error.",
    });

    await prisma.exportRun.update({
      where: { id: run.id },
      data: {
        status: EXPORT_STATUS.FAILED,
        errorMessage: error instanceof Error ? error.message : "Export generation failed.",
      },
    });

    throw error;
  }
}

export async function getExportDownload(userId: string, id: string): Promise<ExportFile | null> {
  const run: ExportDownloadRow | null = await prisma.exportRun.findFirst({
    where: { id, userId },
    select: {
      id: true,
      format: true,
      mode: true,
      scope: true,
      periodStart: true,
      periodEnd: true,
      status: true,
    },
  });

  if (!run || run.status !== EXPORT_STATUS.COMPLETED) return null;

  logExport("download.start", {
    userId,
    exportRunId: run.id,
    format: run.format,
  });

  const payload = payloadFromRun(run);
  const preview = await buildPreview(userId, payload);
  return buildExportFile(run.id, preview, payload);
}
