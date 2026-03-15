import { NextRequest, NextResponse } from "next/server";
import { getAppDataService } from "@/lib/services/app-data-service";
import { getCurrentUserId } from "@/lib/auth/session";
import { withTimeout } from "@/lib/utils/with-timeout";
import type { TransactionsMutationRequest, TransactionsQuery } from "@/types/contracts";

const TRANSACTIONS_API_TIMEOUT_MS = 12000;

function parseQuery(request: NextRequest): TransactionsQuery {
  const searchParams = request.nextUrl.searchParams;

  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "10");

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 10,
    search: searchParams.get("search") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    merchant: searchParams.get("merchant") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    account: searchParams.get("account") ?? undefined,
    purpose: (searchParams.get("purpose") as TransactionsQuery["purpose"]) ?? undefined,
    status: (searchParams.get("status") as TransactionsQuery["status"]) ?? undefined,
    amountMin: searchParams.get("amountMin") ? Number(searchParams.get("amountMin")) : undefined,
    amountMax: searchParams.get("amountMax") ? Number(searchParams.get("amountMax")) : undefined,
  };
}

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const service = getAppDataService();
    const id = request.nextUrl.searchParams.get("id");

    if (id) {
      const tx = await withTimeout(
        service.getTransactionById(userId, id),
        TRANSACTIONS_API_TIMEOUT_MS,
        "Timed out while loading transaction details.",
      );

      if (!tx) {
        return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
      }

      return NextResponse.json(tx);
    }

    const data = await withTimeout(
      service.getTransactions(userId, parseQuery(request)),
      TRANSACTIONS_API_TIMEOUT_MS,
      "Timed out while loading transactions.",
    );

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load transactions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const payload = (await request.json()) as TransactionsMutationRequest;
    const service = getAppDataService();
    const data = await withTimeout(
      service.mutateTransaction(userId, payload),
      TRANSACTIONS_API_TIMEOUT_MS,
      "Timed out while updating transaction.",
    );
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update transaction.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}