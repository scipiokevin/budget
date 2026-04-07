type ParsedStatementTransaction = {
  date?: Date;
  description: string;
  merchant?: string;
  amount: number;
  direction?: "DEBIT" | "CREDIT";
  confidence: number;
  rawLine: string;
};

export type ParsedStatementResult = {
  accountLabel?: string;
  statementPeriodStart?: Date;
  statementPeriodEnd?: Date;
  parserStatus: "parsed" | "needs_review" | "failed";
  parserMessage?: string;
  parserConfidence: number;
  transactions: ParsedStatementTransaction[];
};

const DATE_PATTERNS = [
  /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/,
  /\b(\d{1,2})\/(\d{1,2})\b/,
];

function toAscii(buffer: Buffer) {
  return buffer.toString("latin1").replace(/\u0000/g, " ");
}

function extractVisibleText(raw: string) {
  return raw
    .replace(/\\r/g, " ")
    .replace(/\\n/g, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateToken(token: string): Date | undefined {
  for (const pattern of DATE_PATTERNS) {
    const match = token.match(pattern);
    if (!match) continue;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const yearRaw = match[3];
    const year = yearRaw ? (yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw)) : new Date().getUTCFullYear();
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return undefined;
}

function detectStatementPeriod(text: string): { start?: Date; end?: Date } {
  const periodMatch = text.match(/statement period[^0-9]*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)[^0-9]+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
  if (periodMatch) {
    return {
      start: parseDateToken(periodMatch[1]),
      end: parseDateToken(periodMatch[2]),
    };
  }

  const fallbackDates = [...text.matchAll(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g)].slice(0, 2).map((match) => parseDateToken(match[0]));
  return {
    start: fallbackDates[0],
    end: fallbackDates[1],
  };
}

function detectAccountLabel(filename: string, text: string) {
  const accountMatch = text.match(/account(?: name| label)?[:\s]+([A-Za-z0-9 \-&]+)/i);
  if (accountMatch?.[1]) return accountMatch[1].trim();
  return filename.replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim();
}

function parseAmountToken(token: string) {
  const cleaned = token.replace(/[$,]/g, "").trim();
  if (!cleaned) return undefined;
  const numeric = Number(cleaned.replace(/[()]/g, ""));
  if (Number.isNaN(numeric)) return undefined;
  return cleaned.startsWith("(") && cleaned.endsWith(")") ? -numeric : numeric;
}

function normalizeMerchant(description: string) {
  return description
    .replace(/\s{2,}/g, " ")
    .replace(/\bPOS\b|\bACH\b|\bDEBIT\b|\bCREDIT\b/gi, "")
    .trim()
    .slice(0, 80);
}

function parseTransactionLines(text: string): ParsedStatementTransaction[] {
  const chunks = text
    .split(/(?=\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b)/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  const parsed: ParsedStatementTransaction[] = [];

  for (const chunk of chunks) {
    const dateMatch = chunk.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/);
    if (!dateMatch) continue;

    const amountMatches = [...chunk.matchAll(/-?\(?\$?\d[\d,]*\.\d{2}\)?/g)];
    const amountToken = amountMatches.at(-1)?.[0];
    const amount = amountToken ? parseAmountToken(amountToken) : undefined;
    if (typeof amount !== "number") continue;

    const date = parseDateToken(dateMatch[0]);
    const description = chunk
      .replace(dateMatch[0], "")
      .replace(amountToken ?? "", "")
      .replace(/\s+/g, " ")
      .trim();

    if (!description) continue;

    parsed.push({
      date,
      description,
      merchant: normalizeMerchant(description),
      amount: Math.abs(amount),
      direction: amount < 0 ? "CREDIT" : "DEBIT",
      confidence: date ? 0.86 : 0.62,
      rawLine: chunk,
    });
  }

  return parsed.slice(0, 250);
}

export function parseStatementPdf(buffer: Buffer, filename: string): ParsedStatementResult {
  const raw = toAscii(buffer);
  const text = extractVisibleText(raw);

  if (!text) {
    return {
      parserStatus: "failed",
      parserMessage: "The PDF text could not be extracted. Try a digitally generated statement instead of a scanned image.",
      parserConfidence: 0,
      transactions: [],
    };
  }

  const transactions = parseTransactionLines(text);
  const { start, end } = detectStatementPeriod(text);
  const accountLabel = detectAccountLabel(filename, text);

  if (transactions.length === 0) {
    return {
      accountLabel,
      statementPeriodStart: start,
      statementPeriodEnd: end,
      parserStatus: "needs_review",
      parserMessage: "We could not confidently detect transactions from this PDF. Review the file and try another statement format if needed.",
      parserConfidence: 0.25,
      transactions: [],
    };
  }

  const averageConfidence = Number(
    (transactions.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, transactions.length)).toFixed(2),
  );

  return {
    accountLabel,
    statementPeriodStart: start,
    statementPeriodEnd: end,
    parserStatus: averageConfidence >= 0.8 ? "parsed" : "needs_review",
    parserMessage:
      averageConfidence >= 0.8
        ? "Transactions were extracted from the statement. Review before importing."
        : "Some transactions were extracted, but review carefully before importing.",
    parserConfidence: averageConfidence,
    transactions,
  };
}
