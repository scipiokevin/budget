import * as XLSX from "xlsx";

export type SpreadsheetImportMapping = {
  dateColumn?: string;
  descriptionColumn?: string;
  merchantColumn?: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  directionColumn?: string;
  accountColumn?: string;
};

export type SpreadsheetRawRow = {
  rowNumber: number;
  values: Record<string, string>;
};

type ParsedSpreadsheetTransaction = {
  date?: Date;
  description: string;
  merchant?: string;
  amount: number;
  direction?: "DEBIT" | "CREDIT";
  confidence: number;
  rawLine: string;
};

export type ParsedSpreadsheetResult = {
  sourceSheet?: string;
  accountLabel?: string;
  parserStatus: "parsed" | "needs_review" | "failed";
  parserMessage?: string;
  parserConfidence: number;
  columns: string[];
  mapping: SpreadsheetImportMapping;
  rawRows: SpreadsheetRawRow[];
  transactions: ParsedSpreadsheetTransaction[];
};

const HEADER_MATCHERS: Record<keyof SpreadsheetImportMapping, RegExp[]> = {
  dateColumn: [/\bdate\b/i, /\bposted\b/i, /\btransaction date\b/i],
  descriptionColumn: [/\bdescription\b/i, /\bmemo\b/i, /\bdetails\b/i, /\btransaction\b/i, /\bnarration\b/i],
  merchantColumn: [/\bmerchant\b/i, /\bpayee\b/i, /\bvendor\b/i, /\bname\b/i],
  amountColumn: [/\bamount\b/i, /\btransaction amount\b/i, /\bvalue\b/i],
  debitColumn: [/\bdebit\b/i, /\bwithdraw(al)?\b/i, /\bcharge\b/i, /\bspent\b/i],
  creditColumn: [/\bcredit\b/i, /\bdeposit\b/i, /\bpayment\b/i, /\breceived\b/i],
  directionColumn: [/\bdirection\b/i, /\btype\b/i, /\bdr.?cr\b/i, /\bdebit.?credit\b/i],
  accountColumn: [/\baccount\b/i, /\bcard\b/i, /\bwallet\b/i],
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string, index: number) {
  const normalized = normalizeWhitespace(value);
  return normalized || `Column ${index + 1}`;
}

function parseDate(value: string | undefined) {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const date = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const yearRaw = slashMatch[3];
    const year = yearRaw ? (yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw)) : new Date().getUTCFullYear();
    const date = new Date(Date.UTC(year, Number(slashMatch[1]) - 1, Number(slashMatch[2])));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function parseAmount(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const cleaned = trimmed.replace(/[$,\s]/g, "");
  if (!cleaned) return undefined;

  const normalized = cleaned.startsWith("(") && cleaned.endsWith(")")
    ? `-${cleaned.slice(1, -1)}`
    : cleaned;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function inferDirectionFromText(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;

  if (/(credit|deposit|payment received|incoming|inflow|refund|cr)\b/.test(normalized)) return "CREDIT" as const;
  if (/(debit|withdrawal|withdraw|charge|purchase|outgoing|outflow|dr)\b/.test(normalized)) return "DEBIT" as const;
  return undefined;
}

function normalizeMerchant(value: string | undefined) {
  if (!value) return undefined;
  const normalized = normalizeWhitespace(value.replace(/\bPOS\b|\bACH\b|\bDEBIT\b|\bCREDIT\b/gi, ""));
  return normalized || undefined;
}

function scoreHeaders(headers: string[]) {
  const mapping: SpreadsheetImportMapping = {};

  for (const [field, patterns] of Object.entries(HEADER_MATCHERS) as Array<[keyof SpreadsheetImportMapping, RegExp[]]>) {
    const match = headers.find((header) => patterns.some((pattern) => pattern.test(header)));
    if (match) mapping[field] = match;
  }

  if (!mapping.descriptionColumn && mapping.merchantColumn) {
    mapping.descriptionColumn = mapping.merchantColumn;
  }

  if (!mapping.amountColumn && mapping.debitColumn && mapping.creditColumn) {
    delete mapping.amountColumn;
  }

  return mapping;
}

function buildRowPreview(row: SpreadsheetRawRow, mapping: SpreadsheetImportMapping): ParsedSpreadsheetTransaction | null {
  const values = row.values;
  const date = parseDate(mapping.dateColumn ? values[mapping.dateColumn] : undefined);
  const description = normalizeWhitespace(
    (mapping.descriptionColumn ? values[mapping.descriptionColumn] : "")
      || (mapping.merchantColumn ? values[mapping.merchantColumn] : "")
      || Object.values(values).find((value) => normalizeWhitespace(value).length > 0)
      || "",
  );

  if (!description) return null;

  const directAmount = parseAmount(mapping.amountColumn ? values[mapping.amountColumn] : undefined);
  const debitAmount = parseAmount(mapping.debitColumn ? values[mapping.debitColumn] : undefined);
  const creditAmount = parseAmount(mapping.creditColumn ? values[mapping.creditColumn] : undefined);

  let amount: number | undefined;
  let direction: "DEBIT" | "CREDIT" | undefined;

  if (typeof directAmount === "number") {
    amount = Math.abs(directAmount);
    direction = directAmount < 0 ? "CREDIT" : inferDirectionFromText(mapping.directionColumn ? values[mapping.directionColumn] : undefined) ?? "DEBIT";
  } else if (typeof debitAmount === "number" && Math.abs(debitAmount) > 0) {
    amount = Math.abs(debitAmount);
    direction = "DEBIT";
  } else if (typeof creditAmount === "number" && Math.abs(creditAmount) > 0) {
    amount = Math.abs(creditAmount);
    direction = "CREDIT";
  }

  if (typeof amount !== "number" || amount <= 0) return null;

  if (!direction) {
    direction = inferDirectionFromText(mapping.directionColumn ? values[mapping.directionColumn] : undefined) ?? "DEBIT";
  }

  const merchant = normalizeMerchant(mapping.merchantColumn ? values[mapping.merchantColumn] : description);
  const rawLine = Object.entries(values)
    .filter(([, value]) => normalizeWhitespace(value).length > 0)
    .map(([key, value]) => `${key}: ${normalizeWhitespace(value)}`)
    .join(" | ");

  let confidence = 0.45;
  if (date) confidence += 0.2;
  if (mapping.descriptionColumn) confidence += 0.1;
  if (mapping.merchantColumn) confidence += 0.05;
  if (mapping.amountColumn || mapping.debitColumn || mapping.creditColumn) confidence += 0.15;
  if (mapping.directionColumn) confidence += 0.05;

  return {
    date,
    description,
    merchant,
    amount,
    direction,
    confidence: Number(Math.min(0.98, confidence).toFixed(2)),
    rawLine,
  };
}

function buildTransactions(rawRows: SpreadsheetRawRow[], mapping: SpreadsheetImportMapping) {
  return rawRows
    .map((row) => buildRowPreview(row, mapping))
    .filter((row): row is ParsedSpreadsheetTransaction => Boolean(row))
    .slice(0, 1000);
}

export function deriveSpreadsheetAccountLabel(rawRows: SpreadsheetRawRow[], mapping: SpreadsheetImportMapping, filename: string) {
  const accountColumn = mapping.accountColumn;
  if (accountColumn) {
    const values = [...new Set(rawRows.map((row) => normalizeWhitespace(row.values[accountColumn] ?? "")).filter(Boolean))];
    if (values.length === 1) return values[0];
  }

  return filename.replace(/\.(xls|xlsx|csv)$/i, "").replace(/[-_]/g, " ").trim();
}

export function applySpreadsheetMapping(rawRows: SpreadsheetRawRow[], mapping: SpreadsheetImportMapping) {
  const transactions = buildTransactions(rawRows, mapping);
  const parserConfidence =
    transactions.length === 0
      ? 0
      : Number((transactions.reduce((sum, item) => sum + item.confidence, 0) / transactions.length).toFixed(2));

  return {
    transactions,
    parserStatus: transactions.length > 0 ? (parserConfidence >= 0.75 ? "parsed" : "needs_review") : "failed",
    parserMessage:
      transactions.length > 0
        ? parserConfidence >= 0.75
          ? "Transactions were extracted from the spreadsheet. Review the mapping before importing."
          : "Some transactions were extracted, but review the spreadsheet mapping before importing."
        : "We could not detect transactions from this spreadsheet. Adjust the column mapping and try again.",
    parserConfidence,
  } as const;
}

export async function parseSpreadsheetImport(
  buffer: Buffer,
  filename: string,
): Promise<ParsedSpreadsheetResult> {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: false,
    dense: false,
  });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      parserStatus: "failed",
      parserMessage: "The spreadsheet did not contain any readable sheets.",
      parserConfidence: 0,
      columns: [],
      mapping: {},
      rawRows: [],
      transactions: [],
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const matrix = (XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as unknown[][])
    .map((row) => row.map((cell) => normalizeWhitespace(String(cell ?? ""))));

  const headerIndex = matrix.findIndex((row) => row.filter(Boolean).length >= 2);
  if (headerIndex < 0) {
    return {
      sourceSheet: firstSheetName,
      accountLabel: deriveSpreadsheetAccountLabel([], {}, filename),
      parserStatus: "failed",
      parserMessage: "We could not find a header row in this spreadsheet.",
      parserConfidence: 0,
      columns: [],
      mapping: {},
      rawRows: [],
      transactions: [],
    };
  }

  const headerRow = matrix[headerIndex] ?? [];
  const columns = headerRow.map((value, index) => normalizeHeader(value, index));
  const rawRows: SpreadsheetRawRow[] = matrix
    .slice(headerIndex + 1)
    .map((row, rowOffset) => {
      const values = Object.fromEntries(columns.map((column, index) => [column, normalizeWhitespace(row[index] ?? "")]));
      return {
        rowNumber: headerIndex + rowOffset + 2,
        values,
      };
    })
    .filter((row) => Object.values(row.values).some((value) => value.length > 0));

  const mapping = scoreHeaders(columns);
  const applied = applySpreadsheetMapping(rawRows, mapping);
  const accountLabel = deriveSpreadsheetAccountLabel(rawRows, mapping, filename);

  return {
    sourceSheet: firstSheetName,
    accountLabel,
    parserStatus: applied.parserStatus,
    parserMessage: applied.parserMessage,
    parserConfidence: applied.parserConfidence,
    columns,
    mapping,
    rawRows,
    transactions: applied.transactions,
  };
}
