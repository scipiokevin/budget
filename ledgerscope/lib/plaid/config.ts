const PLAID_BASE_URL_BY_ENV = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
} as const;

export type PlaidEnvironment = keyof typeof PLAID_BASE_URL_BY_ENV;

export function resolvePlaidEnvironment(): PlaidEnvironment {
  const value = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
  if (value === "development" || value === "production" || value === "sandbox") {
    return value;
  }
  return "sandbox";
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const list = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return list.length > 0 ? list : fallback;
}

export function isPlaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function plaidBaseUrl(): string {
  return PLAID_BASE_URL_BY_ENV[resolvePlaidEnvironment()];
}

export function plaidCredentials() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;

  if (!clientId || !secret) {
    throw new Error("Plaid credentials are not configured.");
  }

  return { client_id: clientId, secret };
}

export function plaidProducts(): string[] {
  return parseCsv(process.env.PLAID_PRODUCTS, ["transactions"]);
}

export function plaidCountryCodes(): string[] {
  return parseCsv(process.env.PLAID_COUNTRY_CODES, ["US"]);
}

export function plaidRedirectUri(): string | undefined {
  const value = process.env.PLAID_REDIRECT_URI?.trim();
  return value ? value : undefined;
}

export function plaidWebhookUrl(): string | undefined {
  const value = process.env.PLAID_WEBHOOK_URL?.trim();
  return value ? value : undefined;
}

export function plaidEnvironmentLabel(): string {
  return resolvePlaidEnvironment();
}

export function plaidConfigSummary() {
  return {
    configured: isPlaidConfigured(),
    environment: resolvePlaidEnvironment(),
    products: plaidProducts(),
    countryCodes: plaidCountryCodes(),
    redirectUriConfigured: Boolean(plaidRedirectUri()),
    webhookUrlConfigured: Boolean(plaidWebhookUrl()),
  };
}
