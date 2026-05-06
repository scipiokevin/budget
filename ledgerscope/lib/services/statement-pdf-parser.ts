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

type PdfTextItem = {
  str: string;
  transform?: number[];
};

function ensurePromiseWithResolversPolyfill() {
  // pdfjs-dist uses Promise.withResolvers in newer releases; Node < 22 may not have it.
  if (typeof (Promise as unknown as { withResolvers?: unknown }).withResolvers === "function") return;

  (Promise as unknown as {
    withResolvers: <T>() => { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void };
  }).withResolvers = <T>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

function normalizeExtractedText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

function parseDateToken(token: string, defaultYear = new Date().getUTCFullYear()): Date | undefined {
  for (const pattern of DATE_PATTERNS) {
    const match = token.match(pattern);
    if (!match) continue;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const yearRaw = match[3];
    const year = yearRaw ? (yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw)) : defaultYear;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return undefined;
}

async function extractPdfText(buffer: Buffer) {
  ensurePromiseWithResolversPolyfill();

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const doc = await task.promise;

  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = (content.items ?? []) as unknown[];

      const positioned: Array<{ text: string; x: number; y: number }> = [];
      for (const item of items) {
        const candidate = item as Partial<PdfTextItem>;
        const text = typeof candidate.str === "string" ? candidate.str : "";
        if (!text.trim()) continue;
        const transform = Array.isArray(candidate.transform) ? candidate.transform : undefined;
        const x = typeof transform?.[4] === "number" ? transform[4] : 0;
        const y = typeof transform?.[5] === "number" ? transform[5] : 0;
        positioned.push({ text, x, y });
      }

      // Sort visually: top-to-bottom, then left-to-right.
      positioned.sort((a, b) => (b.y - a.y) || (a.x - b.x));

      const lines: string[] = [];
      let currentY: number | null = null;
      let currentLine: string[] = [];

      for (const item of positioned) {
        if (currentY === null) {
          currentY = item.y;
          currentLine.push(item.text);
          continue;
        }

        const sameLine = Math.abs(item.y - currentY) <= 2;
        if (sameLine) {
          currentLine.push(item.text);
        } else {
          const line = currentLine.join(" ").replace(/\s+/g, " ").trim();
          if (line) lines.push(line);
          currentLine = [item.text];
          currentY = item.y;
        }
      }

      const last = currentLine.join(" ").replace(/\s+/g, " ").trim();
      if (last) lines.push(last);

      pages.push(lines.join("\n"));
    }

    return normalizeExtractedText(pages.join("\n"));
  } finally {
    await doc.destroy();
  }
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

function inferDirection(description: string) {
  const normalized = description.toLowerCase();
  if (
    /\b(payroll|deposit|interest payment|zelle from|transfer from|webxfr p2p|refund)\b/i.test(normalized)
  ) {
    return "CREDIT" as const;
  }

  return "DEBIT" as const;
}

function extractTransactionHistoryChunks(text: string) {
  const lines = text
    .split(/\n+/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .filter((chunk) => chunk.length <= 500);

  const chunks: string[] = [];
  let inTransactionHistory = false;
  let current: string | null = null;

  for (const line of lines) {
    if (/^Transaction history$/i.test(line)) {
      inTransactionHistory = true;
      current = null;
      continue;
    }

    if (!inTransactionHistory) continue;

    if (/^Totals\b/i.test(line)) {
      if (current) chunks.push(current);
      current = null;
      inTransactionHistory = false;
      continue;
    }

    if (/^(Check\s+)?Deposits\b|^Date Description\b|Ending daily/i.test(line)) continue;

    if (/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(line)) {
      if (current) chunks.push(current);
      current = line;
      continue;
    }

    if (current) current = `${current} ${line}`;
  }

  if (current) chunks.push(current);

  return chunks;
}

function parseTransactionLines(text: string, defaultYear?: number): ParsedStatementTransaction[] {
  const chunks = extractTransactionHistoryChunks(text);
  const parsed: ParsedStatementTransaction[] = [];

  for (const chunk of chunks) {
    const dateMatch = chunk.match(/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/);
    if (!dateMatch) continue;

    const amountMatches = [...chunk.matchAll(/-?\(?\$?\d[\d,]*\.\d{2}\)?/g)];
    const amountToken = amountMatches[0]?.[0];
    const amount = amountToken ? parseAmountToken(amountToken) : undefined;
    if (typeof amount !== "number") continue;

    const date = parseDateToken(dateMatch[0], defaultYear);
    const description = chunk
      .replace(dateMatch[0], "")
      .replace(/-?\(?\$?\d[\d,]*\.\d{2}\)?/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!description) continue;

    parsed.push({
      date,
      description,
      merchant: normalizeMerchant(description),
      amount: Math.abs(amount),
      direction: amount < 0 ? "CREDIT" : inferDirection(description),
      confidence: date ? 0.86 : 0.62,
      rawLine: chunk,
    });
  }

  return parsed.slice(0, 250);
}

export async function parseStatementPdf(buffer: Buffer, filename: string): Promise<ParsedStatementResult> {
  let text: string;
  try {
    text = await extractPdfText(buffer);
  } catch (error) {
    console.error("statement-pdf-parser: extract failed", error);
    text = "";
  }

  if (!text) {
    return {
      parserStatus: "failed",
      parserMessage: "The PDF text could not be extracted. Try a digitally generated statement instead of a scanned image.",
      parserConfidence: 0,
      transactions: [],
    };
  }

  const { start, end } = detectStatementPeriod(text);
  const statementYear = end?.getUTCFullYear() ?? start?.getUTCFullYear();
  const transactions = parseTransactionLines(text, statementYear);
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
