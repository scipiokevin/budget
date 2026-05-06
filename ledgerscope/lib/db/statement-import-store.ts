import { prisma } from "@/lib/db/prisma";
import { parseStatementPdf } from "@/lib/services/statement-pdf-parser";
import {
  applySpreadsheetMapping,
  deriveSpreadsheetAccountLabel,
  parseSpreadsheetImport,
  type SpreadsheetImportMapping,
  type SpreadsheetRawRow,
} from "@/lib/services/spreadsheet-import-parser";
import type {
  StatementImportEntryPreview,
  StatementImportFinalizeResponse,
  StatementImportHistoryItem,
  StatementImportHistoryResponse,
  StatementImportPreview,
  StatementImportRemapResponse,
  StatementImportUploadResponse,
} from "@/types/contracts";

type DecimalLike = { toString(): string };
type PrismaTransactionDirection = "DEBIT" | "CREDIT";
type PrismaTransactionSource = "PLAID" | "STATEMENT_PDF" | "SPREADSHEET_IMPORT" | "MANUAL";
type PrismaTransactionPurpose = "PERSONAL" | "BUSINESS" | "SPLIT" | "UNCERTAIN";
type PrismaTransactionStatus = "PENDING" | "POSTED" | "REMOVED";
type PrismaCashFlowType = "INCOME" | "EXPENSE" | "TRANSFER" | "REFUND" | "REIMBURSEMENT" | "ADJUSTMENT";
type PrismaStatementImportKind = "PDF" | "SPREADSHEET";

const STATEMENT_IMPORT_KIND = {
  PDF: "PDF",
  SPREADSHEET: "SPREADSHEET",
} as const satisfies Record<"PDF" | "SPREADSHEET", PrismaStatementImportKind>;

const TRANSACTION_SOURCE = {
  STATEMENT_PDF: "STATEMENT_PDF",
  SPREADSHEET_IMPORT: "SPREADSHEET_IMPORT",
} as const satisfies Record<"STATEMENT_PDF" | "SPREADSHEET_IMPORT", PrismaTransactionSource>;

const TRANSACTION_DIRECTION = {
  DEBIT: "DEBIT",
  CREDIT: "CREDIT",
} as const satisfies Record<"DEBIT" | "CREDIT", PrismaTransactionDirection>;

const TRANSACTION_PURPOSE = {
  UNCERTAIN: "UNCERTAIN",
} as const satisfies Record<"UNCERTAIN", PrismaTransactionPurpose>;

const TRANSACTION_STATUS = {
  POSTED: "POSTED",
  REMOVED: "REMOVED",
} as const satisfies Record<"POSTED" | "REMOVED", PrismaTransactionStatus>;

const CASH_FLOW_TYPE = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
} as const satisfies Record<"INCOME" | "EXPENSE", PrismaCashFlowType>;

type StatementImportEntryRow = {
  id: string;
  date: Date | null;
  description: string;
  merchant: string | null;
  amount: DecimalLike;
  direction: PrismaTransactionDirection | null;
  confidence: DecimalLike | null;
  duplicateTransactionId: string | null;
  selectedForImport: boolean;
};

type StatementImportPreviewRow = {
  id: string;
  importKind: PrismaStatementImportKind;
  filename: string;
  fileSize: number;
  mimeType: string;
  accountLabel: string | null;
  sourceSheet: string | null;
  columnHeaders: unknown;
  columnMapping: unknown;
  statementPeriodStart: Date | null;
  statementPeriodEnd: Date | null;
  parserStatus: string;
  parserMessage: string | null;
  parserConfidence: DecimalLike | null;
  detectedTransactionCount: number;
  importedTransactionCount: number;
  createdAt: Date;
  importedAt: Date | null;
  entries: StatementImportEntryRow[];
};

type StatementImportHistoryRow = {
  id: string;
  importKind: PrismaStatementImportKind;
  filename: string;
  createdAt: Date;
  statementPeriodStart: Date | null;
  statementPeriodEnd: Date | null;
  importedTransactionCount: number;
  parserStatus: string;
  accountLabel: string | null;
};

function toNumber(value: DecimalLike | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function normalizeToUtcDate(value: Date | null | undefined): Date | null {
  if (!value) return null;
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0));
}

function utcDayRange(value: Date) {
  const start = normalizeToUtcDate(value) ?? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function normalizeMerchant(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function formatPeriod(start?: Date | null, end?: Date | null) {
  if (!start && !end) return "Period unavailable";
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (start && end) return `${formatter.format(start)} - ${formatter.format(end)}`;
  return formatter.format(start ?? end ?? new Date());
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSpreadsheetRawRows(value: unknown): value is SpreadsheetRawRow[] {
  return Array.isArray(value) && value.every((row) => {
    if (!isRecord(row)) return false;
    return typeof row.rowNumber === "number" && isRecord(row.values) && Object.values(row.values).every((cell) => typeof cell === "string");
  });
}

function normalizeSpreadsheetMapping(value: unknown): SpreadsheetImportMapping | undefined {
  if (!isRecord(value)) return undefined;

  const keys: Array<keyof SpreadsheetImportMapping> = [
    "dateColumn",
    "descriptionColumn",
    "merchantColumn",
    "amountColumn",
    "debitColumn",
    "creditColumn",
    "directionColumn",
    "accountColumn",
  ];

  const mapping: SpreadsheetImportMapping = {};
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      mapping[key] = candidate.trim();
    }
  }

  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

function mapImportKind(importKind: PrismaStatementImportKind): StatementImportPreview["importKind"] {
  return importKind === STATEMENT_IMPORT_KIND.SPREADSHEET ? "spreadsheet" : "statement_pdf";
}

function mapEntryPreview(row: StatementImportEntryRow): StatementImportEntryPreview {
  return {
    id: row.id,
    date: row.date?.toISOString().slice(0, 10),
    description: row.description,
    merchant: row.merchant ?? undefined,
    amount: toNumber(row.amount),
    direction: row.direction ? row.direction.toLowerCase() as "debit" | "credit" : undefined,
    confidence: toNumber(row.confidence),
    duplicateTransactionId: row.duplicateTransactionId ?? undefined,
    duplicateReason: row.duplicateTransactionId ? "Possible duplicate found in existing transactions." : undefined,
    selectedForImport: row.selectedForImport,
  };
}

function mapImportPreview(row: StatementImportPreviewRow): StatementImportPreview {
  const spreadsheetColumns = row.importKind === STATEMENT_IMPORT_KIND.SPREADSHEET && isStringArray(row.columnHeaders)
    ? row.columnHeaders
    : undefined;
  const spreadsheetMapping = row.importKind === STATEMENT_IMPORT_KIND.SPREADSHEET
    ? normalizeSpreadsheetMapping(row.columnMapping)
    : undefined;

  return {
    id: row.id,
    importKind: mapImportKind(row.importKind),
    filename: row.filename,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    accountLabel: row.accountLabel ?? undefined,
    sourceSheet: row.sourceSheet ?? undefined,
    spreadsheetColumns,
    spreadsheetMapping,
    statementPeriodStart: row.statementPeriodStart?.toISOString(),
    statementPeriodEnd: row.statementPeriodEnd?.toISOString(),
    parserStatus: row.parserStatus as StatementImportPreview["parserStatus"],
    parserMessage: row.parserMessage ?? undefined,
    parserConfidence: toNumber(row.parserConfidence),
    detectedTransactionCount: row.detectedTransactionCount,
    importedTransactionCount: row.importedTransactionCount,
    createdAt: row.createdAt.toISOString(),
    importedAt: row.importedAt?.toISOString(),
    transactions: row.entries.map(mapEntryPreview),
  };
}

async function findDuplicateTransactionId(userId: string, params: { date?: Date; amount: number; merchant?: string }) {
  if (!params.date) return null;

  const { start, end } = utcDayRange(params.date);
  const existing = await prisma.transaction.findFirst({
    where: {
      userId,
      status: { not: TRANSACTION_STATUS.REMOVED },
      date: { gte: start, lt: end },
      amount: params.amount,
    },
    select: {
      id: true,
      merchantRaw: true,
      merchantNormalized: true,
      description: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!existing) return null;

  const candidateMerchant = normalizeMerchant(params.merchant);
  const existingMerchant = normalizeMerchant(existing.merchantRaw ?? existing.merchantNormalized ?? existing.description);

  if (!candidateMerchant || !existingMerchant) return existing.id;
  return candidateMerchant === existingMerchant ? existing.id : null;
}

async function buildPreviewEntries(
  userId: string,
  transactions: Array<{
    date?: Date;
    description: string;
    merchant?: string;
    amount: number;
    direction?: "DEBIT" | "CREDIT";
    confidence: number;
    rawLine: string;
  }>,
) {
  return Promise.all(
    transactions.map(async (transaction) => ({
      userId,
      date: normalizeToUtcDate(transaction.date),
      description: transaction.description,
      merchant: transaction.merchant,
      amount: transaction.amount,
      direction: transaction.direction,
      confidence: transaction.confidence,
      duplicateTransactionId: await findDuplicateTransactionId(userId, {
        date: normalizeToUtcDate(transaction.date) ?? undefined,
        amount: transaction.amount,
        merchant: transaction.merchant,
      }),
      selectedForImport: true,
      rawLine: transaction.rawLine,
    })),
  );
}

async function createStatementImportRecord(data: {
  userId: string;
  importKind: PrismaStatementImportKind;
  filename: string;
  mimeType: string;
  size: number;
  accountLabel?: string;
  sourceSheet?: string;
  columnHeaders?: string[];
  columnMapping?: SpreadsheetImportMapping;
  rawRows?: SpreadsheetRawRow[];
  statementPeriodStart?: Date | null;
  statementPeriodEnd?: Date | null;
  parserStatus: "parsed" | "needs_review" | "failed";
  parserMessage?: string;
  parserConfidence: number;
  transactions: Array<{
    date?: Date;
    description: string;
    merchant?: string;
    amount: number;
    direction?: "DEBIT" | "CREDIT";
    confidence: number;
    rawLine: string;
  }>;
}) {
  const entries = await buildPreviewEntries(data.userId, data.transactions);

  return prisma.statementImport.create({
    data: {
      userId: data.userId,
      importKind: data.importKind,
      filename: data.filename,
      fileSize: data.size,
      mimeType: data.mimeType,
      accountLabel: data.accountLabel,
      sourceSheet: data.sourceSheet,
      columnHeaders: data.columnHeaders,
      columnMapping: data.columnMapping,
      rawRows: data.rawRows,
      statementPeriodStart: normalizeToUtcDate(data.statementPeriodStart),
      statementPeriodEnd: normalizeToUtcDate(data.statementPeriodEnd),
      parserStatus: data.parserStatus,
      parserMessage: data.parserMessage,
      parserConfidence: data.parserConfidence,
      detectedTransactionCount: data.transactions.length,
      entries: {
        create: entries,
      },
    },
    select: {
      id: true,
      importKind: true,
      filename: true,
      fileSize: true,
      mimeType: true,
      accountLabel: true,
      sourceSheet: true,
      columnHeaders: true,
      columnMapping: true,
      statementPeriodStart: true,
      statementPeriodEnd: true,
      parserStatus: true,
      parserMessage: true,
      parserConfidence: true,
      detectedTransactionCount: true,
      importedTransactionCount: true,
      createdAt: true,
      importedAt: true,
      entries: {
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          date: true,
          description: true,
          merchant: true,
          amount: true,
          direction: true,
          confidence: true,
          duplicateTransactionId: true,
          selectedForImport: true,
        },
      },
    },
  });
}

export async function createStatementImportFromPdf(
  userId: string,
  file: { filename: string; mimeType: string; size: number; buffer: Buffer },
): Promise<StatementImportUploadResponse> {
  const parsed = await parseStatementPdf(file.buffer, file.filename);

  const statementImport = await createStatementImportRecord({
    userId,
    importKind: STATEMENT_IMPORT_KIND.PDF,
    filename: file.filename,
    mimeType: file.mimeType,
    size: file.size,
    accountLabel: parsed.accountLabel,
    statementPeriodStart: parsed.statementPeriodStart,
    statementPeriodEnd: parsed.statementPeriodEnd,
    parserStatus: parsed.parserStatus,
    parserMessage: parsed.parserMessage,
    parserConfidence: parsed.parserConfidence,
    transactions: parsed.transactions,
  });

  return {
    importPreview: mapImportPreview(statementImport),
  };
}

export async function createStatementImportFromSpreadsheet(
  userId: string,
  file: { filename: string; mimeType: string; size: number; buffer: Buffer },
): Promise<StatementImportUploadResponse> {
  const parsed = await parseSpreadsheetImport(file.buffer, file.filename);

  const statementImport = await createStatementImportRecord({
    userId,
    importKind: STATEMENT_IMPORT_KIND.SPREADSHEET,
    filename: file.filename,
    mimeType: file.mimeType,
    size: file.size,
    accountLabel: parsed.accountLabel,
    sourceSheet: parsed.sourceSheet,
    columnHeaders: parsed.columns,
    columnMapping: parsed.mapping,
    rawRows: parsed.rawRows,
    parserStatus: parsed.parserStatus,
    parserMessage: parsed.parserMessage,
    parserConfidence: parsed.parserConfidence,
    transactions: parsed.transactions,
  });

  return {
    importPreview: mapImportPreview(statementImport),
  };
}

export async function getStatementImportHistory(userId: string): Promise<StatementImportHistoryResponse> {
  const rows = await prisma.statementImport.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      importKind: true,
      filename: true,
      createdAt: true,
      statementPeriodStart: true,
      statementPeriodEnd: true,
      importedTransactionCount: true,
      parserStatus: true,
      accountLabel: true,
    },
    take: 20,
  });

  const items: StatementImportHistoryItem[] = rows.map((row: StatementImportHistoryRow) => ({
    id: row.id,
    importKind: mapImportKind(row.importKind),
    filename: row.filename,
    uploadedAt: row.createdAt.toISOString(),
    statementPeriodLabel: formatPeriod(row.statementPeriodStart, row.statementPeriodEnd),
    importedTransactionCount: row.importedTransactionCount,
    parserStatus: row.parserStatus as StatementImportHistoryItem["parserStatus"],
    accountLabel: row.accountLabel ?? undefined,
  }));

  return { items };
}

export async function getStatementImportPreview(userId: string, statementImportId: string): Promise<StatementImportPreview | null> {
  const row = await prisma.statementImport.findFirst({
    where: { id: statementImportId, userId },
    select: {
      id: true,
      importKind: true,
      filename: true,
      fileSize: true,
      mimeType: true,
      accountLabel: true,
      sourceSheet: true,
      columnHeaders: true,
      columnMapping: true,
      statementPeriodStart: true,
      statementPeriodEnd: true,
      parserStatus: true,
      parserMessage: true,
      parserConfidence: true,
      detectedTransactionCount: true,
      importedTransactionCount: true,
      createdAt: true,
      importedAt: true,
      entries: {
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          date: true,
          description: true,
          merchant: true,
          amount: true,
          direction: true,
          confidence: true,
          duplicateTransactionId: true,
          selectedForImport: true,
        },
      },
    },
  });

  if (!row) return null;
  return mapImportPreview(row);
}

export async function remapSpreadsheetImport(
  userId: string,
  statementImportId: string,
  mapping: SpreadsheetImportMapping,
): Promise<StatementImportRemapResponse | null> {
  const statementImport = await prisma.statementImport.findFirst({
    where: { id: statementImportId, userId },
    select: {
      id: true,
      filename: true,
      importKind: true,
      rawRows: true,
    },
  });

  if (!statementImport || statementImport.importKind !== STATEMENT_IMPORT_KIND.SPREADSHEET) return null;
  if (!isSpreadsheetRawRows(statementImport.rawRows)) return null;

  const rawRows = statementImport.rawRows;
  const applied = applySpreadsheetMapping(rawRows, mapping);
  const entries = await buildPreviewEntries(userId, applied.transactions);
  const accountLabel = deriveSpreadsheetAccountLabel(rawRows, mapping, statementImport.filename);

  await prisma.$transaction(async (tx) => {
    await tx.statementImportEntry.deleteMany({
      where: { statementImportId },
    });

    await tx.statementImport.update({
      where: { id: statementImportId },
      data: {
        accountLabel,
        columnMapping: mapping,
        parserStatus: applied.parserStatus,
        parserMessage: applied.parserMessage,
        parserConfidence: applied.parserConfidence,
        detectedTransactionCount: applied.transactions.length,
        importedTransactionCount: 0,
        importedAt: null,
      },
    });

    if (entries.length > 0) {
      await tx.statementImportEntry.createMany({
        data: entries.map((entry) => ({
          statementImportId,
          userId: entry.userId,
          date: entry.date,
          description: entry.description,
          merchant: entry.merchant,
          amount: entry.amount,
          direction: entry.direction,
          confidence: entry.confidence,
          duplicateTransactionId: entry.duplicateTransactionId,
          selectedForImport: entry.selectedForImport,
          rawLine: entry.rawLine,
        })),
      });
    }
  });

  const importPreview = await getStatementImportPreview(userId, statementImportId);
  return importPreview ? { importPreview } : null;
}

export async function finalizeStatementImport(
  userId: string,
  statementImportId: string,
  selectedEntryIds?: string[],
): Promise<StatementImportFinalizeResponse | null> {
  const statementImport = await prisma.statementImport.findFirst({
    where: { id: statementImportId, userId },
    include: {
      entries: {
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!statementImport) return null;

  const selectedSet = selectedEntryIds?.length ? new Set(selectedEntryIds) : null;
  let importedCount = 0;

  const transactionSource =
    statementImport.importKind === STATEMENT_IMPORT_KIND.SPREADSHEET
      ? TRANSACTION_SOURCE.SPREADSHEET_IMPORT
      : TRANSACTION_SOURCE.STATEMENT_PDF;

  for (const entry of statementImport.entries) {
    const selected = selectedSet ? selectedSet.has(entry.id) : entry.selectedForImport;
    if (!selected || entry.duplicateTransactionId || !entry.date) {
      await prisma.statementImportEntry.update({
        where: { id: entry.id },
        data: { selectedForImport: selected },
      });
      continue;
    }

    const normalizedEntryDate = normalizeToUtcDate(entry.date);
    if (!normalizedEntryDate) {
      await prisma.statementImportEntry.update({
        where: { id: entry.id },
        data: { selectedForImport: false },
      });
      continue;
    }

    const duplicateId = await findDuplicateTransactionId(userId, {
      date: normalizedEntryDate,
      amount: toNumber(entry.amount),
      merchant: entry.merchant ?? entry.description,
    });

    if (duplicateId) {
      await prisma.statementImportEntry.update({
        where: { id: entry.id },
        data: {
          duplicateTransactionId: duplicateId,
          selectedForImport: false,
        },
      });
      continue;
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        date: normalizedEntryDate,
        postedAt: normalizedEntryDate,
        amount: toNumber(entry.amount),
        currency: "USD",
        direction: entry.direction ?? TRANSACTION_DIRECTION.DEBIT,
        source: transactionSource,
        merchantRaw: entry.merchant ?? entry.description,
        merchantNormalized: normalizeMerchant(entry.merchant ?? entry.description),
        description: entry.description,
        categoryPrimary: "Uncategorized",
        purpose: TRANSACTION_PURPOSE.UNCERTAIN,
        cashFlowType: (entry.direction ?? TRANSACTION_DIRECTION.DEBIT) === TRANSACTION_DIRECTION.CREDIT ? CASH_FLOW_TYPE.INCOME : CASH_FLOW_TYPE.EXPENSE,
        status: TRANSACTION_STATUS.POSTED,
      },
      select: { id: true },
    });

    await prisma.statementImportEntry.update({
      where: { id: entry.id },
      data: {
        transactionId: transaction.id,
        selectedForImport: true,
      },
    });

    importedCount += 1;
  }

  await prisma.statementImport.update({
    where: { id: statementImportId },
    data: {
      parserStatus: importedCount > 0 ? "imported" : statementImport.parserStatus,
      importedTransactionCount: importedCount,
      importedAt: importedCount > 0 ? new Date() : statementImport.importedAt,
    },
  });

  const importPreview = await getStatementImportPreview(userId, statementImportId);
  if (!importPreview) return null;
  return { importPreview, importedCount };
}

export async function cancelStatementImport(userId: string, statementImportId: string): Promise<boolean> {
  const existing = await prisma.statementImport.findFirst({
    where: { id: statementImportId, userId },
    select: { id: true },
  });
  if (!existing) return false;

  await prisma.statementImport.update({
    where: { id: statementImportId },
    data: { parserStatus: "cancelled" },
  });
  return true;
}
