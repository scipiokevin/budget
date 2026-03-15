import { Prisma, TransactionStatus, WatchMatchStatus, WatchMatchType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type {
  WatchCandidateTransaction,
  WatchMatchItem,
  WatchMatchStatus as UiWatchMatchStatus,
  WatchRuleItem,
  WatchlistData,
  WatchlistMutationRequest,
  WatchlistMutationResponse,
} from "@/types/contracts";

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function mapStatus(status: WatchMatchStatus): UiWatchMatchStatus {
  if (status === WatchMatchStatus.ACKNOWLEDGED) return "acknowledged";
  if (status === WatchMatchStatus.DISMISSED) return "dismissed";
  return "new";
}

function mapMatchType(matchType: WatchMatchType): "exact" | "fuzzy" {
  return matchType === WatchMatchType.EXACT ? "exact" : "fuzzy";
}

function merchantMatches(pattern: string, merchant: string, matchType: WatchMatchType): boolean {
  const p = normalize(pattern);
  const m = normalize(merchant);
  if (!p || !m) return false;

  if (matchType === WatchMatchType.EXACT) return p === m;
  return m.includes(p) || p.includes(m);
}

function amountMatches(amount: number, min: number | null, max: number | null): boolean {
  if (min !== null && amount < min) return false;
  if (max !== null && amount > max) return false;
  return true;
}

export async function evaluateWatchMatchesForUser(userId: string): Promise<void> {
  const [rules, txs] = await Promise.all([
    prisma.watchRule.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        merchantPattern: true,
        amountMin: true,
        amountMax: true,
        matchType: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        status: { not: TransactionStatus.REMOVED },
      },
      select: {
        id: true,
        merchantRaw: true,
        merchantNormalized: true,
        amount: true,
      },
      orderBy: { date: "desc" },
      take: 400,
    }),
  ]);

  for (const rule of rules) {
    for (const tx of txs) {
      const merchant = tx.merchantRaw ?? tx.merchantNormalized ?? "";
      const amount = Math.abs(toNumber(tx.amount));

      if (!merchantMatches(rule.merchantPattern, merchant, rule.matchType)) continue;
      if (!amountMatches(amount, rule.amountMin ? toNumber(rule.amountMin) : null, rule.amountMax ? toNumber(rule.amountMax) : null)) continue;

      await prisma.watchMatch.upsert({
        where: {
          watchRuleId_transactionId: {
            watchRuleId: rule.id,
            transactionId: tx.id,
          },
        },
        update: {
          similarityScore: rule.matchType === WatchMatchType.EXACT ? 1 : 0.8,
        },
        create: {
          userId,
          watchRuleId: rule.id,
          transactionId: tx.id,
          similarityScore: rule.matchType === WatchMatchType.EXACT ? 1 : 0.8,
          status: WatchMatchStatus.NEW,
        },
      });
    }
  }
}

export async function getWatchlistDataFromPrisma(userId: string): Promise<WatchlistData> {
  const [rules, matches, suspicious] = await Promise.all([
    prisma.watchRule.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.watchMatch.findMany({
      where: { userId },
      include: {
        watchRule: true,
        transaction: {
          select: {
            id: true,
            date: true,
            amount: true,
            merchantRaw: true,
            merchantNormalized: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.transaction.findMany({
      where: { userId, isSuspicious: true, status: { not: TransactionStatus.REMOVED } },
      select: {
        id: true,
        date: true,
        amount: true,
        merchantRaw: true,
        merchantNormalized: true,
        categoryPrimary: true,
      },
      orderBy: { date: "desc" },
      take: 20,
    }),
  ]);

  const activeRules: WatchRuleItem[] = rules.map((rule) => ({
    id: rule.id,
    merchantPattern: rule.merchantPattern,
    amountMin: rule.amountMin ? toNumber(rule.amountMin) : undefined,
    amountMax: rule.amountMax ? toNumber(rule.amountMax) : undefined,
    matchType: mapMatchType(rule.matchType),
    note: rule.note ?? undefined,
    isActive: rule.isActive,
    createdAt: rule.createdAt.toISOString().slice(0, 10),
  }));

  const recentMatches: WatchMatchItem[] = matches.map((match) => ({
    id: match.id,
    watchRuleId: match.watchRuleId,
    watchRuleLabel: match.watchRule.merchantPattern,
    merchant: match.transaction.merchantRaw ?? match.transaction.merchantNormalized ?? "Unknown merchant",
    amount: toNumber(match.transaction.amount),
    date: match.transaction.date.toISOString().slice(0, 10),
    status: mapStatus(match.status),
    merchantNote: match.watchRule.note ?? undefined,
    similarityScore: match.similarityScore ? toNumber(match.similarityScore) : undefined,
    transactionId: match.transaction.id,
  }));

  const suspiciousCandidates: WatchCandidateTransaction[] = suspicious.map((tx) => ({
    id: tx.id,
    merchant: tx.merchantRaw ?? tx.merchantNormalized ?? "Unknown merchant",
    amount: toNumber(tx.amount),
    date: tx.date.toISOString().slice(0, 10),
    category: tx.categoryPrimary ?? "Uncategorized",
  }));

  return {
    title: "Watchlist",
    description: "Create suspicious-charge watch rules and review matched transactions.",
    selectedRange: "This month",
    actions: [
      { label: "Create Watch Rule", variant: "primary" },
      { label: "Refresh Matches", variant: "secondary" },
    ],
    activeRules,
    recentMatches,
    suspiciousCandidates,
  };
}

export async function mutateWatchlistInPrisma(userId: string, payload: WatchlistMutationRequest): Promise<WatchlistMutationResponse> {
  switch (payload.action) {
    case "createFromTransaction": {
      const tx = await prisma.transaction.findFirst({
        where: { id: payload.transactionId, userId },
        select: { id: true, amount: true, merchantRaw: true, merchantNormalized: true },
      });

      if (!tx) throw new Error("Transaction not found.");

      const merchantPattern = tx.merchantRaw ?? tx.merchantNormalized ?? "Unknown merchant";
      const amount = Math.abs(toNumber(tx.amount));
      const tolerancePct = payload.amountTolerancePct ?? 5;
      const min = Math.max(0, amount * (1 - tolerancePct / 100));
      const max = amount * (1 + tolerancePct / 100);

      await prisma.watchRule.create({
        data: {
          userId,
          createdFromTransactionId: tx.id,
          merchantPattern,
          amountMin: min,
          amountMax: max,
          matchType: payload.matchType === "exact" ? WatchMatchType.EXACT : WatchMatchType.FUZZY,
          note: payload.note ?? null,
          isActive: true,
        },
      });

      break;
    }
    case "createRule": {
      await prisma.watchRule.create({
        data: {
          userId,
          merchantPattern: payload.merchantPattern,
          amountMin: payload.amountMin ?? null,
          amountMax: payload.amountMax ?? null,
          matchType: payload.matchType === "exact" ? WatchMatchType.EXACT : WatchMatchType.FUZZY,
          note: payload.note ?? null,
          isActive: true,
        },
      });
      break;
    }
    case "updateRule": {
      await prisma.watchRule.updateMany({
        where: { id: payload.ruleId, userId },
        data: {
          merchantPattern: payload.merchantPattern,
          amountMin: payload.amountMin,
          amountMax: payload.amountMax,
          matchType: payload.matchType ? (payload.matchType === "exact" ? WatchMatchType.EXACT : WatchMatchType.FUZZY) : undefined,
          note: payload.note,
          isActive: payload.isActive,
        },
      });
      break;
    }
    case "setMatchStatus": {
      await prisma.watchMatch.updateMany({
        where: { id: payload.matchId, userId },
        data: {
          status: payload.status === "acknowledged" ? WatchMatchStatus.ACKNOWLEDGED : WatchMatchStatus.DISMISSED,
        },
      });
      break;
    }
    case "escalateMatch": {
      const match = await prisma.watchMatch.findFirst({
        where: { id: payload.matchId, userId },
        select: { transactionId: true },
      });

      if (!match) throw new Error("Match not found.");

      await prisma.watchMatch.updateMany({
        where: { id: payload.matchId, userId },
        data: { status: WatchMatchStatus.ACKNOWLEDGED },
      });

      await prisma.transactionFlag.create({
        data: {
          transactionId: match.transactionId,
          userId,
          flagType: "watchlist_escalation",
          reason: payload.reason ?? "Escalated from watchlist match",
        },
      });
      break;
    }
  }

  await evaluateWatchMatchesForUser(userId);
  return { ok: true };
}