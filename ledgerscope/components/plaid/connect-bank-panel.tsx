"use client";

import { forwardRef, useImperativeHandle, useState } from "react";

type ConnectBankPanelProps = {
  compact?: boolean;
};

export type ConnectBankPanelHandle = {
  connect: () => Promise<void>;
};

type LinkTokenResponse = {
  linkToken: string;
  expiration: string;
  isMock: boolean;
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

export const ConnectBankPanel = forwardRef<ConnectBankPanelHandle, ConnectBankPanelProps>(function ConnectBankPanel(
  { compact = false },
  ref,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function connectSandboxBank() {
    setLoading(true);
    setError(null);
    setStatus("Creating link token...");

    try {
      const linkRes = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!linkRes.ok) {
        throw new Error("Unable to create Plaid link token. Check Plaid configuration.");
      }

      const linkData = (await linkRes.json()) as LinkTokenResponse;
      setStatus(linkData.isMock ? "Using mock Plaid mode..." : "Generating sandbox bank token...");

      const sandboxRes = await fetch("/api/plaid/sandbox/public-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!sandboxRes.ok) {
        throw new Error("Unable to create sandbox public token.");
      }

      const sandboxData = (await sandboxRes.json()) as SandboxTokenResponse;

      setStatus("Exchanging public token...");
      const exchangeRes = await fetch("/api/plaid/exchange-public-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicToken: sandboxData.publicToken,
          institutionId: "ins_109508",
          institutionName: "First Platypus Bank",
        }),
      });

      if (!exchangeRes.ok) {
        throw new Error("Unable to exchange public token for access token.");
      }

      const exchangeData = (await exchangeRes.json()) as ExchangeResponse;

      setStatus("Syncing transactions...");
      const syncRes = await fetch("/api/plaid/transactions-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankConnectionId: exchangeData.bankConnectionId }),
      });

      if (!syncRes.ok) {
        throw new Error("Bank linked, but transaction sync failed.");
      }

      const syncData = (await syncRes.json()) as SyncResponse;
      setStatus(`Bank linked. Synced ${syncData.added} new transactions.`);
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
    connect: connectSandboxBank,
  }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Connect Bank</h3>
          <p className="text-sm text-slate-600">
            Link a Plaid sandbox institution to sync US transactions into your dashboard and transaction list.
          </p>
        </div>
        {!compact ? (
          <button
            type="button"
            onClick={() => void connectSandboxBank()}
            disabled={loading}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Connecting..." : "Connect Bank"}
          </button>
        ) : null}
      </div>

      {status ? <p className="mt-3 text-sm text-emerald-700">{status}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      {!compact ? (
        <p className="mt-2 text-xs text-slate-500">
          If Plaid keys are missing, this flow falls back to mock mode and still validates app behavior.
        </p>
      ) : null}
    </div>
  );
});