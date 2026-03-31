"use client";

import { forwardRef, useImperativeHandle, useState } from "react";

declare global {
  interface Window {
    Plaid?: {
      create: (options: PlaidCreateOptions) => PlaidHandler;
    };
  }
}

type ConnectBankPanelProps = {
  compact?: boolean;
  bankConnectionId?: string;
};

export type ConnectBankPanelHandle = {
  connect: () => Promise<void>;
};

type PlaidCreateOptions = {
  token: string;
  onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void;
  onExit?: (error: PlaidLinkError | null) => void;
};

type PlaidHandler = {
  open: () => void;
  destroy: () => void;
};

type PlaidLinkMetadata = {
  institution?: {
    institution_id?: string;
    name?: string;
  };
};

type PlaidLinkError = {
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
};

type LinkTokenResponse = {
  linkToken: string;
  expiration: string;
  isMock: boolean;
  mode: "create" | "update";
  bankConnectionId?: string;
};

type SandboxTokenResponse = {
  publicToken: string;
  isMock: boolean;
};

type ExchangeResponse = {
  bankConnectionId: string;
  itemId: string;
  isMock: boolean;
};

type SyncResponse = {
  syncedConnections: number;
  added: number;
  modified: number;
  removed: number;
};

let plaidScriptPromise: Promise<void> | null = null;

async function ensurePlaidScriptLoaded() {
  if (typeof window === "undefined") return;
  if (window.Plaid) return;

  if (!plaidScriptPromise) {
    plaidScriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-plaid-link="true"]');
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Failed to load Plaid Link.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
      script.async = true;
      script.dataset.plaidLink = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Plaid Link."));
      document.head.appendChild(script);
    });
  }

  await plaidScriptPromise;

  if (!window.Plaid) {
    throw new Error("Plaid Link is unavailable right now.");
  }
}

export const ConnectBankPanel = forwardRef<ConnectBankPanelHandle, ConnectBankPanelProps>(function ConnectBankPanel(
  { compact = false, bankConnectionId },
  ref,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function syncConnection(connectionId?: string) {
    setStatus("Syncing transactions...");
    const syncRes = await fetch("/api/plaid/transactions-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connectionId ? { bankConnectionId: connectionId } : {}),
    });

    if (!syncRes.ok) {
      const payload = (await syncRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Bank linked, but transaction sync failed.");
    }

    const syncData = (await syncRes.json()) as SyncResponse;
    setStatus(`Connection healthy. ${syncData.added} new, ${syncData.modified} updated, ${syncData.removed} removed.`);
  }

  async function runSandboxFallback() {
    setStatus("Using sandbox fallback...");

    const sandboxRes = await fetch("/api/plaid/sandbox/public-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!sandboxRes.ok) {
      throw new Error("Unable to create sandbox public token.");
    }

    const sandboxData = (await sandboxRes.json()) as SandboxTokenResponse;

    setStatus("Exchanging sandbox token...");
    const exchangeRes = await fetch("/api/plaid/exchange-public-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicToken: sandboxData.publicToken,
        institutionId: "ins_109508",
        institutionName: "First Platypus Bank",
        bankConnectionId,
      }),
    });

    if (!exchangeRes.ok) {
      const payload = (await exchangeRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Unable to exchange sandbox token.");
    }

    const exchangeData = (await exchangeRes.json()) as ExchangeResponse;
    await syncConnection(exchangeData.bankConnectionId);
  }

  async function runPlaidLink(linkData: LinkTokenResponse) {
    await ensurePlaidScriptLoaded();

    setStatus(linkData.mode === "update" ? "Opening bank repair flow..." : "Opening Plaid Link...");

    await new Promise<void>((resolve, reject) => {
      const handler = window.Plaid?.create({
        token: linkData.linkToken,
        onSuccess: (publicToken, metadata) => {
          void (async () => {
            try {
              if (linkData.mode === "update") {
                await syncConnection(linkData.bankConnectionId ?? bankConnectionId);
                resolve();
                return;
              }

              setStatus("Exchanging secure bank token...");
              const exchangeRes = await fetch("/api/plaid/exchange-public-token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  publicToken,
                  institutionId: metadata.institution?.institution_id,
                  institutionName: metadata.institution?.name,
                  bankConnectionId,
                }),
              });

              if (!exchangeRes.ok) {
                const payload = (await exchangeRes.json().catch(() => null)) as { error?: string } | null;
                throw new Error(payload?.error ?? "Unable to exchange public token for an access token.");
              }

              const exchangeData = (await exchangeRes.json()) as ExchangeResponse;
              await syncConnection(exchangeData.bankConnectionId);
              resolve();
            } catch (err) {
              reject(err);
            } finally {
              handler?.destroy();
            }
          })();
        },
        onExit: (exitError) => {
          handler?.destroy();
          if (exitError) {
            reject(new Error(exitError.display_message ?? exitError.error_message ?? "Plaid Link exited before completing."));
            return;
          }

          reject(new Error("Plaid Link was closed before finishing."));
        },
      });

      if (!handler) {
        reject(new Error("Plaid Link failed to initialize."));
        return;
      }

      handler.open();
    });
  }

  async function connectBank() {
    setLoading(true);
    setError(null);
    setStatus(bankConnectionId ? "Preparing reconnect flow..." : "Creating Plaid link token...");

    try {
      const linkRes = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bankConnectionId ? { bankConnectionId, mode: "update" } : {}),
      });

      if (!linkRes.ok) {
        const payload = (await linkRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to create Plaid link token. Check Plaid configuration.");
      }

      const linkData = (await linkRes.json()) as LinkTokenResponse;

      if (linkData.isMock) {
        await runSandboxFallback();
      } else {
        await runPlaidLink(linkData);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bank connection failed.";
      setError(message);
      setStatus(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  useImperativeHandle(ref, () => ({
    connect: connectBank,
  }));

  const title = bankConnectionId ? "Repair bank connection" : "Connect Bank";
  const description = bankConnectionId
    ? "Reconnect this institution to restore transaction updates and clear Item errors."
    : "Link a Plaid-supported bank to sync transactions into your dashboard, budgets, and alerts.";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
        {!compact ? (
          <button
            type="button"
            onClick={() => void connectBank()}
            disabled={loading}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (bankConnectionId ? "Repairing..." : "Connecting...") : bankConnectionId ? "Reconnect Bank" : "Connect Bank"}
          </button>
        ) : null}
      </div>

      {status ? <p className="mt-3 text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      {!compact ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <p>
            Production mode uses Plaid Link with secure token exchange and webhook-driven sync updates. If Plaid keys are missing, LedgerScope falls back to sandbox mode so the app can still be exercised safely.
          </p>
        </div>
      ) : null}
    </div>
  );
});
