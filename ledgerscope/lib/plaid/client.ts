import {
  isPlaidConfigured,
  plaidBaseUrl,
  plaidCountryCodes,
  plaidCredentials,
  plaidEnvironmentLabel,
  plaidProducts,
  plaidRedirectUri,
  plaidWebhookUrl,
} from "@/lib/plaid/config";

type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  amount: number;
  pending: boolean;
  date: string;
  authorized_date: string | null;
  merchant_name: string | null;
  name: string;
  payment_channel: string;
  personal_finance_category: {
    primary: string | null;
    detailed: string | null;
  } | null;
  iso_currency_code: string | null;
};

type PlaidRemovedTransaction = {
  transaction_id: string;
};

type PlaidTransactionsSyncResponse = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: PlaidRemovedTransaction[];
  has_more: boolean;
  next_cursor: string;
  request_id: string;
};

type PlaidExchangeTokenResponse = {
  access_token: string;
  item_id: string;
  request_id: string;
};

type PlaidCreateLinkTokenResponse = {
  link_token: string;
  expiration: string;
  request_id: string;
};

type PlaidSandboxPublicTokenResponse = {
  public_token: string;
  request_id: string;
};

type PlaidSandboxTransactionsCreateResponse = {
  transactions: PlaidTransaction[];
  request_id: string;
};

type PlaidWebhookVerificationJwk = {
  kty: string;
  alg?: string;
  crv?: string;
  kid?: string;
  use?: string;
  x?: string;
  y?: string;
  [key: string]: string | boolean | string[] | undefined;
};

type PlaidWebhookVerificationKeyResponse = {
  key: PlaidWebhookVerificationJwk;
  request_id: string;
};

type PlaidLinkTokenMode = "create" | "update";

type CreatePlaidLinkTokenInput = {
  userId: string;
  email?: string | null;
  redirectUri?: string;
  accessToken?: string;
  mode?: PlaidLinkTokenMode;
};

type PlaidErrorPayload = {
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
  error_type?: string;
  request_id?: string;
};

class PlaidApiError extends Error {
  status: number;
  code?: string;
  displayMessage?: string | null;
  requestId?: string;

  constructor(status: number, payload: PlaidErrorPayload, fallback: string) {
    super(payload.error_message ?? fallback);
    this.name = "PlaidApiError";
    this.status = status;
    this.code = payload.error_code;
    this.displayMessage = payload.display_message;
    this.requestId = payload.request_id;
  }
}

async function plaidPost<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const credentials = plaidCredentials();
  const response = await fetch(`${plaidBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...credentials,
      ...payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let payload: PlaidErrorPayload = {};

    try {
      payload = JSON.parse(errorText) as PlaidErrorPayload;
    } catch {
      payload = {};
    }

    throw new PlaidApiError(response.status, payload, `Plaid request failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function createPlaidLinkToken({
  userId,
  email,
  redirectUri,
  accessToken,
  mode = "create",
}: CreatePlaidLinkTokenInput) {
  if (!isPlaidConfigured()) {
    return {
      isMock: true,
      linkToken: `link-sandbox-mock-${userId}-${Date.now()}`,
      expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      mode,
    };
  }

  const payload: Record<string, unknown> = {
    user: {
      client_user_id: userId,
      email_address: email ?? undefined,
    },
    client_name: "LedgerScope",
    products: plaidProducts(),
    country_codes: plaidCountryCodes(),
    language: "en",
  };

  const webhook = plaidWebhookUrl();
  if (webhook) {
    payload.webhook = webhook;
  }

  const resolvedRedirectUri = redirectUri ?? plaidRedirectUri();
  if (resolvedRedirectUri) {
    payload.redirect_uri = resolvedRedirectUri;
  }

  if (mode === "update" && accessToken) {
    payload.access_token = accessToken;
  }

  const response = await plaidPost<PlaidCreateLinkTokenResponse>("/link/token/create", payload);

  return {
    isMock: false,
    linkToken: response.link_token,
    expiration: response.expiration,
    mode,
  };
}

export async function createSandboxPublicToken(institutionId = "ins_109508") {
  if (!isPlaidConfigured()) {
    return {
      isMock: true,
      publicToken: `public-mock-${Date.now()}`,
    };
  }

  const response = await plaidPost<PlaidSandboxPublicTokenResponse>("/sandbox/public_token/create", {
    institution_id: institutionId,
    initial_products: plaidProducts(),
  });

  return {
    isMock: false,
    publicToken: response.public_token,
  };
}

export async function exchangePlaidPublicToken(publicToken: string) {
  if (!isPlaidConfigured()) {
    return {
      isMock: true,
      itemId: `item-mock-${Date.now()}`,
      accessToken: `access-mock-${Date.now()}`,
    };
  }

  const response = await plaidPost<PlaidExchangeTokenResponse>("/item/public_token/exchange", {
    public_token: publicToken,
  });

  return {
    isMock: false,
    itemId: response.item_id,
    accessToken: response.access_token,
  };
}

export async function getPlaidWebhookVerificationKey(keyId: string) {
  if (!isPlaidConfigured()) {
    throw new Error("Plaid credentials are not configured.");
  }

  return plaidPost<PlaidWebhookVerificationKeyResponse>("/webhook_verification_key/get", {
    key_id: keyId,
  });
}

function mockTransactionsSync(cursor?: string | null): PlaidTransactionsSyncResponse {
  const alreadySynced = Boolean(cursor);
  const now = new Date();
  const isoDate = now.toISOString().slice(0, 10);

  return {
    added: alreadySynced
      ? []
      : [
          {
            transaction_id: `tx-mock-${Date.now()}`,
            account_id: "acc-mock-1",
            amount: 42.75,
            pending: false,
            date: isoDate,
            authorized_date: isoDate,
            merchant_name: "Trader Joe's",
            name: "TRADER JOES #019",
            payment_channel: "in store",
            personal_finance_category: {
              primary: "FOOD_AND_DRINK",
              detailed: "FOOD_AND_DRINK_GROCERIES",
            },
            iso_currency_code: "USD",
          },
        ],
    modified: [],
    removed: [],
    has_more: false,
    next_cursor: `cursor-mock-${Date.now()}`,
    request_id: `request-mock-${Date.now()}`,
  };
}

export async function plaidTransactionsSync(accessToken: string, cursor?: string | null) {
  if (!isPlaidConfigured()) {
    return mockTransactionsSync(cursor);
  }

  let nextCursor = cursor ?? null;
  let hasMore = true;
  const added: PlaidTransaction[] = [];
  const modified: PlaidTransaction[] = [];
  const removed: PlaidRemovedTransaction[] = [];
  let requestId = "";

  while (hasMore) {
    const response = await plaidPost<PlaidTransactionsSyncResponse>("/transactions/sync", {
      access_token: accessToken,
      cursor: nextCursor,
      count: 100,
      options: {
        include_personal_finance_category: true,
      },
    });

    added.push(...response.added);
    modified.push(...response.modified);
    removed.push(...response.removed);
    hasMore = response.has_more;
    nextCursor = response.next_cursor;
    requestId = response.request_id;
  }

  if (
    plaidEnvironmentLabel() === "sandbox" &&
    !cursor &&
    added.length === 0 &&
    modified.length === 0 &&
    removed.length === 0
  ) {
    const seeded = mockTransactionsSync(cursor);
    return {
      ...seeded,
      request_id: requestId || seeded.request_id,
    };
  }

  return {
    added,
    modified,
    removed,
    has_more: false,
    next_cursor: nextCursor ?? cursor ?? "",
    request_id: requestId,
  };
}

export async function seedPlaidSandboxTransactions(accessToken: string) {
  if (!isPlaidConfigured()) {
    return;
  }

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 30);

  const toDate = (date: Date) => date.toISOString().slice(0, 10);

  await plaidPost<PlaidSandboxTransactionsCreateResponse>("/sandbox/transactions/create", {
    access_token: accessToken,
    start_date: toDate(start),
    end_date: toDate(today),
    options: {
      count: 12,
    },
  });
}

export function plaidSupportsOAuthRedirect() {
  return Boolean(plaidRedirectUri());
}

export function plaidEnvironmentIsProductionLike() {
  const environment = plaidEnvironmentLabel();
  return environment === "production" || environment === "development";
}

export { PlaidApiError };
export type { CreatePlaidLinkTokenInput, PlaidLinkTokenMode, PlaidRemovedTransaction, PlaidTransaction };
