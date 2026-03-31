import { createHash, createPublicKey, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { recomputeSmartInsights } from "@/lib/db/smart-insights-store";
import { evaluateWatchMatchesForUser } from "@/lib/db/watchlist-store";
import {
  createPlaidLinkToken,
  createSandboxPublicToken,
  exchangePlaidPublicToken,
  getPlaidWebhookVerificationKey,
  PlaidApiError,
  plaidTransactionsSync,
  seedPlaidSandboxTransactions,
  type PlaidTransaction,
} from "@/lib/plaid/client";
import { plaidConfigSummary, plaidEnvironmentLabel, isPlaidConfigured } from "@/lib/plaid/config";
import { decryptToken, encryptToken } from "@/lib/security/token-encryption";

type ExchangeResult = {
  bankConnectionId: string;
  itemId: string;
  isMock: boolean;
};

type LinkTokenResult = {
  linkToken: string;
  expiration: string;
  isMock: boolean;
  mode: "create" | "update";
  bankConnectionId?: string;
};

type TransactionsSyncResult = {
  syncedConnections: number;
  added: number;
  modified: number;
  removed: number;
  nextCursorByConnection: Record<string, string>;
};

type JsonPrimitive = string | number | boolean | null;
type JsonInputValue = JsonPrimitive | JsonInputValue[] | JsonObject;
type JsonObject = { [key: string]: JsonInputValue };
type PlaidWebhookJwtPayload = {
  iat?: number;
  request_body_sha256?: string;
};
type PlaidWebhookPayload = {
  item_id?: string;
  webhook_type?: string;
  webhook_code?: string;
  error?: {
    error_code?: string;
    error_message?: string;
    display_message?: string | null;
  };
  environment?: string;
  [key: string]: unknown;
};

type VerifyWebhookResult = {
  verified: boolean;
  reason?: string;
};

type PrismaCashFlowType =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER"
  | "REFUND"
  | "REIMBURSEMENT"
  | "ADJUSTMENT";
type PrismaConnectionStatus = "ACTIVE" | "INACTIVE" | "ERROR";
type PrismaReviewStatus = "UNREVIEWED" | "REVIEWED" | "NEEDS_REVIEW";
type PrismaTransactionDirection = "DEBIT" | "CREDIT";
type PrismaTransactionStatus = "PENDING" | "POSTED" | "REMOVED";
type PrismaTransactionPurpose = "PERSONAL" | "BUSINESS" | "SPLIT" | "UNCERTAIN";

const CASH_FLOW_TYPE = {
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
} as const satisfies Record<"INCOME" | "EXPENSE", PrismaCashFlowType>;

const CONNECTION_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ERROR: "ERROR",
} as const satisfies Record<"ACTIVE" | "INACTIVE" | "ERROR", PrismaConnectionStatus>;

const REVIEW_STATUS = {
  UNREVIEWED: "UNREVIEWED",
} as const satisfies Record<"UNREVIEWED", PrismaReviewStatus>;

const TRANSACTION_DIRECTION = {
  DEBIT: "DEBIT",
  CREDIT: "CREDIT",
} as const satisfies Record<"DEBIT" | "CREDIT", PrismaTransactionDirection>;

const TRANSACTION_STATUS = {
  PENDING: "PENDING",
  POSTED: "POSTED",
  REMOVED: "REMOVED",
} as const satisfies Record<"PENDING" | "POSTED" | "REMOVED", PrismaTransactionStatus>;

const TRANSACTION_PURPOSE = {
  UNCERTAIN: "UNCERTAIN",
} as const satisfies Record<"UNCERTAIN", PrismaTransactionPurpose>;

function logPlaid(stage: string, detail: Record<string, unknown>) {
  console.info("[plaid]", JSON.stringify({ stage, timestamp: new Date().toISOString(), ...detail }));
}

function logPlaidError(stage: string, detail: Record<string, unknown>) {
  console.error("[plaid]", JSON.stringify({ stage, timestamp: new Date().toISOString(), ...detail }));
}

function safeError(error: unknown) {
  if (error instanceof PlaidApiError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      code: error.code,
      displayMessage: error.displayMessage ?? undefined,
      requestId: error.requestId,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return { message: "Unknown error" };
}

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

function toJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject;
}

function isReconnectWebhook(payload: PlaidWebhookPayload) {
  return (
    (payload.webhook_type === "ITEM" &&
      (payload.webhook_code === "ERROR" || payload.webhook_code === "PENDING_EXPIRATION" || payload.webhook_code === "PENDING_DISCONNECT")) ||
    payload.webhook_code === "USER_PERMISSION_REVOKED" ||
    payload.webhook_code === "USER_ACCOUNT_REVOKED"
  );
}

function isRepairWebhook(payload: PlaidWebhookPayload) {
  return payload.webhook_type === "ITEM" && (payload.webhook_code === "LOGIN_REPAIRED" || payload.webhook_code === "NEW_ACCOUNTS_AVAILABLE");
}

function isTransactionsUpdateWebhook(payload: PlaidWebhookPayload) {
  return payload.webhook_type === "TRANSACTIONS" && payload.webhook_code === "SYNC_UPDATES_AVAILABLE";
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

function decodeJwtHeaderAndPayload(token: string) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Malformed Plaid webhook JWT.");
  }

  const header = JSON.parse(decodeBase64Url(encodedHeader).toString("utf8")) as { alg?: string; kid?: string };
  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8")) as PlaidWebhookJwtPayload;

  return {
    header,
    payload,
    encodedHeader,
    encodedPayload,
    signature: decodeBase64Url(encodedSignature),
  };
}

async function verifyPlaidWebhook(rawBody: string, signatureHeader: string | null): Promise<VerifyWebhookResult> {
  if (!isPlaidConfigured()) {
    return { verified: true, reason: "plaid_not_configured" };
  }

  if (!signatureHeader) {
    return { verified: false, reason: "missing_signature" };
  }

  try {
    const decoded = decodeJwtHeaderAndPayload(signatureHeader);
    if (decoded.header.alg !== "ES256" || !decoded.header.kid) {
      return { verified: false, reason: "invalid_header" };
    }

    const keyResponse = await getPlaidWebhookVerificationKey(decoded.header.kid);
    const publicKey = createPublicKey({ key: keyResponse.key, format: "jwk" });
    const signedContent = Buffer.from(`${decoded.encodedHeader}.${decoded.encodedPayload}`);

    const signatureIsValid = verifySignature("sha256", signedContent, { key: publicKey, dsaEncoding: "ieee-p1363" }, decoded.signature);
    if (!signatureIsValid) {
      return { verified: false, reason: "invalid_signature" };
    }

    if (!decoded.payload.iat || Math.abs(Date.now() / 1000 - decoded.payload.iat) > 60 * 5) {
      return { verified: false, reason: "expired_signature" };
    }

    const expectedHash = decoded.payload.request_body_sha256;
    if (!expectedHash) {
      return { verified: false, reason: "missing_body_hash" };
    }

    const actualHash = createHash("sha256").update(rawBody).digest("hex");
    if (expectedHash.length !== actualHash.length) {
      return { verified: false, reason: "body_hash_mismatch" };
    }

    const matches = timingSafeEqual(Buffer.from(expectedHash, "utf8"), Buffer.from(actualHash, "utf8"));
    if (!matches) {
      return { verified: false, reason: "body_hash_mismatch" };
    }

    return { verified: true };
  } catch (error) {
    logPlaidError("webhook.verify.error", {
      config: plaidConfigSummary(),
      error: safeError(error),
    });
    return { verified: false, reason: "verification_exception" };
  }
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

async function markConnectionHealthy(connectionId: string) {
  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: {
      status: CONNECTION_STATUS.ACTIVE,
      requiresReconnect: false,
      itemErrorCode: null,
      itemErrorMessage: null,
      updatedAt: new Date(),
    },
  });
}

async function markConnectionReconnectRequired(connectionId: string, code?: string | null, message?: string | null) {
  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: {
      status: CONNECTION_STATUS.ERROR,
      requiresReconnect: true,
      itemErrorCode: code ?? null,
      itemErrorMessage: message ?? null,
      updatedAt: new Date(),
    },
  });
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
  const direction = tx.amount >= 0 ? TRANSACTION_DIRECTION.DEBIT : TRANSACTION_DIRECTION.CREDIT;
  const cashFlowType = tx.amount >= 0 ? CASH_FLOW_TYPE.EXPENSE : CASH_FLOW_TYPE.INCOME;

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
      purpose: TRANSACTION_PURPOSE.UNCERTAIN,
      cashFlowType,
      status: tx.pending ? TRANSACTION_STATUS.PENDING : TRANSACTION_STATUS.POSTED,
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
      purpose: TRANSACTION_PURPOSE.UNCERTAIN,
      cashFlowType,
      status: tx.pending ? TRANSACTION_STATUS.PENDING : TRANSACTION_STATUS.POSTED,
      reviewStatus: REVIEW_STATUS.UNREVIEWED,
    },
  });
}

export async function generateLinkTokenForUser(
  userId: string,
  email?: string | null,
  options?: { redirectUri?: string; bankConnectionId?: string; mode?: "create" | "update" },
): Promise<LinkTokenResult> {
  const requestedMode = options?.mode ?? (options?.bankConnectionId ? "update" : "create");

  if (requestedMode === "update" && options?.bankConnectionId) {
    const connection = await prisma.bankConnection.findFirst({
      where: { id: options.bankConnectionId, userId },
      select: { id: true, accessTokenEncrypted: true, requiresReconnect: true, institutionName: true },
    });

    if (!connection) {
      throw new Error("Bank connection not found for update mode.");
    }

    logPlaid("link_token.create", {
      userId,
      bankConnectionId: connection.id,
      mode: "update",
      institutionName: connection.institutionName ?? undefined,
      env: plaidEnvironmentLabel(),
    });

    const accessToken = decryptToken(connection.accessTokenEncrypted);
    const result = await createPlaidLinkToken({
      userId,
      email,
      redirectUri: options.redirectUri,
      accessToken,
      mode: "update",
    });

    return {
      ...result,
      bankConnectionId: connection.id,
    };
  }

  logPlaid("link_token.create", {
    userId,
    mode: "create",
    env: plaidEnvironmentLabel(),
    config: plaidConfigSummary(),
  });

  return createPlaidLinkToken({
    userId,
    email,
    redirectUri: options?.redirectUri,
    mode: "create",
  });
}

export async function createSandboxPublicTokenForUser() {
  return createSandboxPublicToken();
}

export async function exchangePublicTokenForUser(
  userId: string,
  publicToken: string,
  institutionId?: string,
  institutionName?: string,
  bankConnectionId?: string,
): Promise<ExchangeResult> {
  logPlaid("token_exchange.start", {
    userId,
    institutionId: institutionId ?? undefined,
    institutionName: institutionName ?? undefined,
    bankConnectionId: bankConnectionId ?? undefined,
  });

  const exchanged = await exchangePlaidPublicToken(publicToken);
  const accessTokenEncrypted = encryptToken(exchanged.accessToken);

  const existingConnection = bankConnectionId
    ? await prisma.bankConnection.findFirst({
        where: { id: bankConnectionId, userId },
        select: { id: true },
      })
    : null;

  if (bankConnectionId && !existingConnection) {
    throw new Error("Bank connection not found for token exchange.");
  }

  const connection = existingConnection
    ? await prisma.bankConnection.update({
        where: { id: existingConnection.id },
        data: {
          plaidItemId: exchanged.itemId,
          institutionId: institutionId ?? null,
          institutionName: institutionName ?? null,
          accessTokenEncrypted,
          status: CONNECTION_STATUS.ACTIVE,
          requiresReconnect: false,
          itemErrorCode: null,
          itemErrorMessage: null,
          updatedAt: new Date(),
        },
        select: { id: true },
      })
    : await prisma.bankConnection.upsert({
        where: { plaidItemId: exchanged.itemId },
        update: {
          userId,
          institutionId: institutionId ?? null,
          institutionName: institutionName ?? null,
          accessTokenEncrypted,
          status: CONNECTION_STATUS.ACTIVE,
          requiresReconnect: false,
          itemErrorCode: null,
          itemErrorMessage: null,
          updatedAt: new Date(),
        },
        create: {
          userId,
          plaidItemId: exchanged.itemId,
          institutionId: institutionId ?? null,
          institutionName: institutionName ?? null,
          accessTokenEncrypted,
          status: CONNECTION_STATUS.ACTIVE,
          requiresReconnect: false,
        },
        select: { id: true },
      });

  logPlaid("token_exchange.complete", {
    userId,
    bankConnectionId: connection.id,
    itemId: exchanged.itemId,
    isMock: exchanged.isMock,
  });

  return {
    bankConnectionId: connection.id,
    itemId: exchanged.itemId,
    isMock: exchanged.isMock,
  };
}

function connectionWhere(userId: string, bankConnectionId?: string) {
  if (bankConnectionId) {
    return { userId, id: bankConnectionId };
  }

  return {
    userId,
    status: { in: [CONNECTION_STATUS.ACTIVE, CONNECTION_STATUS.ERROR] },
  };
}

export async function syncTransactionsForUser(userId: string, bankConnectionId?: string): Promise<TransactionsSyncResult> {
  const connections = await prisma.bankConnection.findMany({
    where: connectionWhere(userId, bankConnectionId),
    select: { id: true, accessTokenEncrypted: true, status: true, plaidItemId: true },
  });

  const result: TransactionsSyncResult = {
    syncedConnections: 0,
    added: 0,
    modified: 0,
    removed: 0,
    nextCursorByConnection: {},
  };

  for (const connection of connections) {
    logPlaid("sync.start", {
      userId,
      bankConnectionId: connection.id,
      plaidItemId: connection.plaidItemId,
      status: connection.status,
    });

    try {
      const latestCursor = await prisma.syncCursor.findFirst({
        where: { userId, bankConnectionId: connection.id },
        orderBy: { syncedAt: "desc" },
        select: { cursor: true },
      });

      const accessToken = decryptToken(connection.accessTokenEncrypted);

      if (!latestCursor?.cursor && plaidEnvironmentLabel() === "sandbox") {
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
          data: { status: TRANSACTION_STATUS.REMOVED },
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
        data: {
          status: CONNECTION_STATUS.ACTIVE,
          requiresReconnect: false,
          itemErrorCode: null,
          itemErrorMessage: null,
          lastSyncedAt: new Date(),
        },
      });

      result.syncedConnections += 1;
      result.added += synced.added.length;
      result.modified += synced.modified.length;
      result.removed += synced.removed.length;
      result.nextCursorByConnection[connection.id] = synced.next_cursor;

      logPlaid("sync.complete", {
        userId,
        bankConnectionId: connection.id,
        added: synced.added.length,
        modified: synced.modified.length,
        removed: synced.removed.length,
      });
    } catch (error) {
      if (error instanceof PlaidApiError) {
        await markConnectionReconnectRequired(connection.id, error.code ?? "PLAID_SYNC_ERROR", error.displayMessage ?? error.message);
      }

      logPlaidError("sync.error", {
        userId,
        bankConnectionId: connection.id,
        error: safeError(error),
      });

      throw error;
    }
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

async function handlePlaidWebhookEvent(connection: { id: string; userId: string }, payload: PlaidWebhookPayload) {
  if (isTransactionsUpdateWebhook(payload)) {
    await syncTransactionsForUser(connection.userId, connection.id);
    return "transactions_sync";
  }

  if (isReconnectWebhook(payload)) {
    await markConnectionReconnectRequired(
      connection.id,
      payload.error?.error_code ?? payload.webhook_code ?? "ITEM_RECONNECT_REQUIRED",
      payload.error?.display_message ?? payload.error?.error_message ?? "Plaid reported that this Item needs to be repaired.",
    );
    return "marked_reconnect_required";
  }

  if (isRepairWebhook(payload)) {
    await markConnectionHealthy(connection.id);
    await syncTransactionsForUser(connection.userId, connection.id);
    return "marked_healthy_and_synced";
  }

  await prisma.bankConnection.update({
    where: { id: connection.id },
    data: { lastWebhookAt: new Date() },
  });

  return "logged_only";
}

export async function ingestPlaidWebhook(rawBody: string, signatureHeader: string | null) {
  const verification = await verifyPlaidWebhook(rawBody, signatureHeader);
  const data = JSON.parse(rawBody) as PlaidWebhookPayload;

  logPlaid("webhook.received", {
    itemId: data.item_id ?? undefined,
    webhookType: data.webhook_type ?? undefined,
    webhookCode: data.webhook_code ?? undefined,
    verified: verification.verified,
    reason: verification.reason,
  });

  if (!verification.verified) {
    return { accepted: false, stored: false, verified: false, reason: verification.reason };
  }

  const plaidItemId = data.item_id;
  if (!plaidItemId) {
    return { accepted: true, stored: false, verified: true, reason: "missing_item_id" };
  }

  const connection = await prisma.bankConnection.findUnique({
    where: { plaidItemId },
    select: { id: true, userId: true },
  });

  if (!connection) {
    logPlaid("webhook.unmatched_item", {
      itemId: plaidItemId,
      webhookType: data.webhook_type ?? undefined,
      webhookCode: data.webhook_code ?? undefined,
    });
    return { accepted: true, stored: false, verified: true, reason: "connection_not_found" };
  }

  const event = await prisma.webhookEvent.create({
    data: {
      userId: connection.userId,
      bankConnectionId: connection.id,
      source: "plaid",
      eventType: data.webhook_type ?? "unknown",
      eventCode: data.webhook_code ?? null,
      payload: toJsonObject(data),
    },
    select: { id: true },
  });

  const action = await handlePlaidWebhookEvent(connection, data);

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date() },
  });

  await prisma.bankConnection.update({
    where: { id: connection.id },
    data: { lastWebhookAt: new Date() },
  });

  logPlaid("webhook.processed", {
    bankConnectionId: connection.id,
    itemId: plaidItemId,
    webhookType: data.webhook_type ?? undefined,
    webhookCode: data.webhook_code ?? undefined,
    action,
  });

  return { accepted: true, stored: true, verified: true, action };
}
