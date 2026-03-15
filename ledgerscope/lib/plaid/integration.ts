import {
  CashFlowType,
  ConnectionStatus,
  Prisma,
  ReviewStatus,
  TransactionDirection,
  TransactionStatus,
  TransactionPurpose,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recomputeSmartInsights } from "@/lib/db/smart-insights-store";
import { evaluateWatchMatchesForUser } from "@/lib/db/watchlist-store";
import { decryptToken, encryptToken } from "@/lib/security/token-encryption";
import {
  createPlaidLinkToken,
  createSandboxPublicToken,
  exchangePlaidPublicToken,
  plaidTransactionsSync,
  seedPlaidSandboxTransactions,
  type PlaidTransaction,
} from "@/lib/plaid/client";

type ExchangeResult = {
  bankConnectionId: string;
  itemId: string;
  isMock: boolean;
};

type TransactionsSyncResult = {
  syncedConnections: number;
  added: number;
  modified: number;
  removed: number;
  nextCursorByConnection: Record<string, string>;
};

function normalizeMerchant(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? null;
}

function categoryFromPlaid(tx: PlaidTransaction) {
  const primary = tx.personal_finance_category?.primary ?? null;
  const detailed = tx.personal_finance_category?.detailed ?? null;

  return {
    primary: primary ? primary.replaceAll("_", " ") : null,
    detailed: detailed ? detailed.replaceAll("_", " ") : null,
  };
}

async function ensureBankAccount(userId: string, bankConnectionId: string, plaidAccountId: string) {
  const account = await prisma.bankAccount.upsert({
    where: { plaidAccountId },
    update: {
      userId,
      bankConnectionId,
      name: `Account ${plaidAccountId.slice(-4)}`,
      type: "depository",
      subtype: null,
    },
    create: {
      userId,
      bankConnectionId,
      plaidAccountId,
      name: `Account ${plaidAccountId.slice(-4)}`,
      type: "depository",
      subtype: null,
    },
    select: { id: true },
  });

  return account.id;
}

async function upsertTransactionFromPlaid(userId: string, bankConnectionId: string, tx: PlaidTransaction) {
  if (!tx.transaction_id) return;

  const bankAccountId = await ensureBankAccount(userId, bankConnectionId, tx.account_id);

  const existingRaw = await prisma.transactionRaw.findFirst({
    where: { userId, plaidTransactionId: tx.transaction_id },
    orderBy: { importedAt: "desc" },
    select: { id: true },
  });

  const raw = existingRaw
    ? await prisma.transactionRaw.update({
        where: { id: existingRaw.id },
        data: {
          bankConnectionId,
          bankAccountId,
          payload: tx,
          authorizedAt: tx.authorized_date ? new Date(tx.authorized_date) : null,
          postedAt: new Date(tx.date),
          amount: Math.abs(tx.amount),
          currency: tx.iso_currency_code ?? "USD",
          isPending: tx.pending,
        },
        select: { id: true },
      })
    : await prisma.transactionRaw.create({
        data: {
          userId,
          bankConnectionId,
          bankAccountId,
          plaidTransactionId: tx.transaction_id,
          payload: tx,
          authorizedAt: tx.authorized_date ? new Date(tx.authorized_date) : null,
          postedAt: new Date(tx.date),
          amount: Math.abs(tx.amount),
          currency: tx.iso_currency_code ?? "USD",
          isPending: tx.pending,
        },
        select: { id: true },
      });

  const category = categoryFromPlaid(tx);
  const direction = tx.amount >= 0 ? TransactionDirection.DEBIT : TransactionDirection.CREDIT;
  const cashFlowType = tx.amount >= 0 ? CashFlowType.EXPENSE : CashFlowType.INCOME;

  await prisma.transaction.upsert({
    where: { plaidTransactionId: tx.transaction_id },
    update: {
      userId,
      bankAccountId,
      transactionRawId: raw.id,
      date: new Date(tx.date),
      authorizedAt: tx.authorized_date ? new Date(tx.authorized_date) : null,
      postedAt: new Date(tx.date),
      amount: Math.abs(tx.amount),
      currency: tx.iso_currency_code ?? "USD",
      direction,
      merchantRaw: tx.merchant_name,
      merchantNormalized: normalizeMerchant(tx.merchant_name),
      description: tx.name,
      categoryPrimary: category.primary,
      categoryDetailed: category.detailed,
      purpose: TransactionPurpose.UNCERTAIN,
      cashFlowType,
      status: tx.pending ? TransactionStatus.PENDING : TransactionStatus.POSTED,
    },
    create: {
      userId,
      bankAccountId,
      transactionRawId: raw.id,
      plaidTransactionId: tx.transaction_id,
      date: new Date(tx.date),
      authorizedAt: tx.authorized_date ? new Date(tx.authorized_date) : null,
      postedAt: new Date(tx.date),
      amount: Math.abs(tx.amount),
      currency: tx.iso_currency_code ?? "USD",
      direction,
      merchantRaw: tx.merchant_name,
      merchantNormalized: normalizeMerchant(tx.merchant_name),
      description: tx.name,
      categoryPrimary: category.primary,
      categoryDetailed: category.detailed,
      purpose: TransactionPurpose.UNCERTAIN,
      cashFlowType,
      status: tx.pending ? TransactionStatus.PENDING : TransactionStatus.POSTED,
      reviewStatus: ReviewStatus.UNREVIEWED,
    },
  });
}

export async function generateLinkTokenForUser(userId: string, email?: string | null, redirectUri?: string) {
  return createPlaidLinkToken(userId, email, redirectUri);
}

export async function createSandboxPublicTokenForUser() {
  return createSandboxPublicToken();
}

export async function exchangePublicTokenForUser(
  userId: string,
  publicToken: string,
  institutionId?: string,
  institutionName?: string,
): Promise<ExchangeResult> {
  const exchanged = await exchangePlaidPublicToken(publicToken);
  const accessTokenEncrypted = encryptToken(exchanged.accessToken);

  const connection = await prisma.bankConnection.upsert({
    where: { plaidItemId: exchanged.itemId },
    update: {
      userId,
      institutionId: institutionId ?? null,
      institutionName: institutionName ?? null,
      accessTokenEncrypted,
      status: ConnectionStatus.ACTIVE,
      updatedAt: new Date(),
    },
    create: {
      userId,
      plaidItemId: exchanged.itemId,
      institutionId: institutionId ?? null,
      institutionName: institutionName ?? null,
      accessTokenEncrypted,
      status: ConnectionStatus.ACTIVE,
    },
    select: { id: true },
  });

  return {
    bankConnectionId: connection.id,
    itemId: exchanged.itemId,
    isMock: exchanged.isMock,
  };
}

export async function syncTransactionsForUser(userId: string, bankConnectionId?: string): Promise<TransactionsSyncResult> {
  const connections = await prisma.bankConnection.findMany({
    where: {
      userId,
      ...(bankConnectionId ? { id: bankConnectionId } : {}),
      status: ConnectionStatus.ACTIVE,
    },
    select: { id: true, accessTokenEncrypted: true },
  });

  const result: TransactionsSyncResult = {
    syncedConnections: 0,
    added: 0,
    modified: 0,
    removed: 0,
    nextCursorByConnection: {},
  };

  for (const connection of connections) {
    const latestCursor = await prisma.syncCursor.findFirst({
      where: { userId, bankConnectionId: connection.id },
      orderBy: { syncedAt: "desc" },
      select: { cursor: true },
    });

    const accessToken = decryptToken(connection.accessTokenEncrypted);

    if (!latestCursor?.cursor && process.env.PLAID_ENV?.toLowerCase() === "sandbox") {
      try {
        await seedPlaidSandboxTransactions(accessToken);
      } catch {
        // Non-fatal in sandbox: proceed with normal sync even if seed call fails.
      }
    }

    const synced = await plaidTransactionsSync(accessToken, latestCursor?.cursor ?? null);

    for (const tx of synced.added) {
      await upsertTransactionFromPlaid(userId, connection.id, tx);
    }

    for (const tx of synced.modified) {
      await upsertTransactionFromPlaid(userId, connection.id, tx);
    }

    for (const removed of synced.removed) {
      await prisma.transaction.updateMany({
        where: { userId, plaidTransactionId: removed.transaction_id },
        data: { status: TransactionStatus.REMOVED },
      });
    }

    await prisma.syncCursor.upsert({
      where: {
        bankConnectionId_cursor: {
          bankConnectionId: connection.id,
          cursor: synced.next_cursor,
        },
      },
      update: {
        syncedAt: new Date(),
      },
      create: {
        userId,
        bankConnectionId: connection.id,
        cursor: synced.next_cursor,
        syncedAt: new Date(),
      },
    });

    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });

    result.syncedConnections += 1;
    result.added += synced.added.length;
    result.modified += synced.modified.length;
    result.removed += synced.removed.length;
    result.nextCursorByConnection[connection.id] = synced.next_cursor;
  }

  if (result.syncedConnections > 0) {
    try {
      await evaluateWatchMatchesForUser(userId);
    } catch {
      // Do not fail sync completion if watchlist matching fails.
    }

    try {
      await recomputeSmartInsights(userId);
    } catch {
      // Do not fail sync completion if insight generation fails.
    }
  }

  return result;
}

export async function ingestPlaidWebhook(payload: unknown) {
  const data = (payload ?? {}) as {
    item_id?: string;
    webhook_type?: string;
    webhook_code?: string;
    [key: string]: unknown;
  };

  const plaidItemId = data.item_id;
  if (!plaidItemId) {
    return { accepted: true, stored: false };
  }

  const connection = await prisma.bankConnection.findUnique({
    where: { plaidItemId },
    select: { id: true, userId: true },
  });

  if (!connection) {
    return { accepted: true, stored: false };
  }

  const normalizedPayload = JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;

  await prisma.webhookEvent.create({
    data: {
      userId: connection.userId,
      bankConnectionId: connection.id,
      source: "plaid",
      eventType: data.webhook_type ?? "unknown",
      eventCode: data.webhook_code ?? null,
      payload: normalizedPayload,
      processedAt: new Date(),
    },
  });

  return { accepted: true, stored: true };
}