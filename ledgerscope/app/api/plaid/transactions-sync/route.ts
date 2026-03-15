import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { invalidJsonResponse, parseOptionalJsonBody, validationErrorResponse } from "@/lib/validation/api-validation";
import { plaidTransactionsSyncSchema } from "@/lib/validation/schemas/plaid";
import { syncTransactionsForUser } from "@/lib/plaid/integration";
import type { AppApiError } from "@/types/api-errors";

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json<AppApiError>({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const payload = await parseOptionalJsonBody(request, plaidTransactionsSyncSchema, {});
    const result = await syncTransactionsForUser(userId, payload.bankConnectionId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    if (error instanceof SyntaxError) return invalidJsonResponse();

    return NextResponse.json<AppApiError>(
      { error: "Failed to sync transactions.", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
