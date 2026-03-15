import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { invalidJsonResponse, parseJsonBody, validationErrorResponse } from "@/lib/validation/api-validation";
import { plaidExchangePublicTokenSchema } from "@/lib/validation/schemas/plaid";
import { exchangePublicTokenForUser } from "@/lib/plaid/integration";
import type { AppApiError } from "@/types/api-errors";

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json<AppApiError>({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const payload = await parseJsonBody(request, plaidExchangePublicTokenSchema);

    const exchanged = await exchangePublicTokenForUser(
      userId,
      payload.publicToken,
      payload.institutionId,
      payload.institutionName,
    );

    return NextResponse.json({
      bankConnectionId: exchanged.bankConnectionId,
      itemId: exchanged.itemId,
      isMock: exchanged.isMock,
    });
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    if (error instanceof SyntaxError) return invalidJsonResponse();

    return NextResponse.json<AppApiError>(
      { error: "Failed to exchange public token.", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
