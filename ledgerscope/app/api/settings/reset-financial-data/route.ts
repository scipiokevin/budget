import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { resetFinancialDataInPrisma } from "@/lib/db/financial-reset-store";
import type { AppApiError } from "@/types/api-errors";

const resetSchema = z.object({
  confirmation: z.literal("RESET"),
});

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json<AppApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = crypto.randomUUID();

  try {
    const body = await request.json();
    const parsed = resetSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<AppApiError>(
        {
          error: "Confirmation text must be RESET.",
          code: "VALIDATION_ERROR",
          details: "Type RESET exactly to clear financial data.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const summary = await resetFinancialDataInPrisma(userId);

    console.info("[settings.reset-financial-data]", {
      requestId,
      userId,
      summary,
    });

    return NextResponse.json({ ok: true, summary }, { status: 200 });
  } catch (error) {
    console.error("[settings.reset-financial-data]", {
      requestId,
      userId,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });

    return NextResponse.json<AppApiError>(
      {
        error: "Failed to reset financial data.",
        code: "SERVER_ERROR",
        details: "Please try again.",
      },
      { status: 500 },
    );
  }
}
