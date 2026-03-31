import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { invalidJsonResponse, parseOptionalJsonBody, validationErrorResponse } from "@/lib/validation/api-validation";
import { plaidCreateLinkTokenSchema } from "@/lib/validation/schemas/plaid";
import { generateLinkTokenForUser } from "@/lib/plaid/integration";
import type { AppApiError } from "@/types/api-errors";

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json<AppApiError>({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await parseOptionalJsonBody(request, plaidCreateLinkTokenSchema, {});
    const result = await generateLinkTokenForUser(userId, session.user.email, {
      redirectUri: body.redirectUri,
      bankConnectionId: body.bankConnectionId,
      mode: body.mode,
    });

    return NextResponse.json({
      linkToken: result.linkToken,
      expiration: result.expiration,
      isMock: result.isMock,
      mode: result.mode,
      bankConnectionId: result.bankConnectionId,
    });
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    if (error instanceof SyntaxError) return invalidJsonResponse();

    console.error("[plaid] create-link-token failed", error);
    return NextResponse.json<AppApiError>(
      { error: "Failed to create Plaid link token.", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
