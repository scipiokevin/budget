import { prisma } from "@/lib/db/prisma";
import { parseStatementPdf } from "@/lib/services/statement-pdf-parser";
import type {
  StatementImportEntryPreview,
  StatementImportFinalizeResponse,
  StatementImportHistoryItem,
  StatementImportHistoryResponse,
  StatementImportPreview,
  StatementImportUploadResponse,
} from "@/types/contracts";

type DecimalLike = { toString(): string };
type PrismaTransactionDirection = "DEBIT" | "CREDIT";
type PrismaTransactionSource = "PLAID" | "STATEMENT_PDF" | "MANUAL";
type PrismaTransactionPurpose = "PERSONAL" | "BUSINESS" | "SPLIT" | "UNCERTAIN";
type PrismaTransactionStatus = "PENDING" | "POSTED" | "REMOVED";
type PrismaCashFlowType = "INCOME" | "EXPENSE" | "TRANSFER" | "REFUND" | "REIMBURSEMENT" | "ADJUSTMENT";

const TRANSACTION_SOURCE = {
  STATEMENT_PDF: "STATEMENT_PDF",
} as const satisfies Record<"STATEMENT_PDF", PrismaTransactionSource>;

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

function toNumber(value: DecimalLike | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
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

async function findDuplicateTransactionId(userId: string, params: { date?: Date; amount: number; merchant?: string }) {
  if (!params.date) return null;

  const existing = await prisma.transaction.findFirst({
    where: {
      userId,
      status: { not: TRANSACTION_STATUS.REMOVED },
      date: params.date,
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

export async function createStatementImportFromPdf(
  userId: string,
  file: { filename: string; mimeType: string; size: number; buffer: Buffer },
): Promise<StatementImportUploadResponse> {
  const parsed = parseStatementPdf(file.buffer, file.filename);

  const statementImport = await prisma.statementImport.create({
    data: {
      userId,
      filename: file.filename,
      fileSize: file.size,
      mimeType: file.mimeType,
      accountLabel: parsed.accountLabel,
      statementPeriodStart: parsed.statementPeriodStart,
      statementPeriodEnd: parsed.statementPeriodEnd,
      parserStatus: parsed.parserStatus,
      parserMessage: parsed.parserMessage,
      parserConfidence: parsed.parserConfidence,
      detectedTransactionCount: parsed.transactions.length,
      entries: {
        create: await Promise.all(
          parsed.transactions.map(async (transaction) => ({
            userId,
            date: transaction.date,
            description: transaction.description,
            merchant: transaction.merchant,
            amount: transaction.amount,
            direction: transaction.direction,
            confidence: transaction.confidence,
            duplicateTransactionId: await findDuplicateTransactionId(userId, {
              date: transaction.date,
              amount: transaction.amount,
              merchant: transaction.merchant,
            }),
            selectedForImport: true,
            rawLine: transaction.rawLine,
          })),
        ),
      },
    },
    include: {
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

  return {
    importPreview: {
      id: statementImport.id,
      filename: statementImport.filename,
      fileSize: statementImport.fileSize,
      mimeType: statementImport.mimeType,
      accountLabel: statementImport.accountLabel ?? undefined,
      statementPeriodStart: statementImport.statementPeriodStart?.toISOString(),
      statementPeriodEnd: statementImport.statementPeriodEnd?.toISOString(),
      parserStatus: statementImport.parserStatus as StatementImportPreview["parserStatus"],
      parserMessage: statementImport.parserMessage ?? undefined,
      parserConfidence: toNumber(statementImport.parserConfidence),
      detectedTransactionCount: statementImport.detectedTransactionCount,
      importedTransactionCount: statementImport.importedTransactionCount,
      createdAt: statementImport.createdAt.toISOString(),
      importedAt: statementImport.importedAt?.toISOString(),
      transactions: statementImport.entries.map(mapEntryPreview),
    },
  };
}

export async function getStatementImportHistory(userId: string): Promise<StatementImportHistoryResponse> {
  const rows = await prisma.statementImport.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
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

  const items: StatementImportHistoryItem[] = rows.map((row) => ({
    id: row.id,
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
    include: {
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

  return {
    id: row.id,
    filename: row.filename,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    accountLabel: row.accountLabel ?? undefined,
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

  for (const entry of statementImport.entries) {
    const selected = selectedSet ? selectedSet.has(entry.id) : entry.selectedForImport;
    if (!selected || entry.duplicateTransactionId || !entry.date) {
      await prisma.statementImportEntry.update({
        where: { id: entry.id },
        data: { selectedForImport: selected },
      });
      continue;
    }

    const duplicateId = await findDuplicateTransactionId(userId, {
      date: entry.date,
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
        date: entry.date,
        postedAt: entry.date,
        amount: toNumber(entry.amount),
        currency: "USD",
        direction: entry.direction ?? TRANSACTION_DIRECTION.DEBIT,
        source: TRANSACTION_SOURCE.STATEMENT_PDF,
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
