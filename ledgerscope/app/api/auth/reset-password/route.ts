import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resetPasswordWithToken } from "@/lib/auth/password-reset";
import { TimeoutError, withTimeout } from "@/lib/utils/with-timeout";
import type { AppApiError } from "@/types/api-errors";

const resetPasswordSchema = z
  .object({
    token: z.string().min(20),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });

const DB_TIMEOUT_MS = 10000;

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<AppApiError>(
        {
          error: "Invalid password reset payload.",
          code: "VALIDATION_ERROR",
          details: "Please provide a valid token and matching passwords.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const result = await withTimeout(
      resetPasswordWithToken(parsed.data.token, parsed.data.password),
      DB_TIMEOUT_MS,
      "Password reset timed out.",
    );

    if (result.status === "expired") {
      return NextResponse.json<AppApiError>(
        {
          error: "This password reset link has expired.",
          code: "EXPIRED",
          details: "Request a new reset link and try again.",
        },
        { status: 410 },
      );
    }

    if (result.status === "invalid") {
      return NextResponse.json<AppApiError>(
        {
          error: "This password reset link is invalid.",
          code: "INVALID_TOKEN",
          details: "Request a new reset link and try again.",
        },
        { status: 400 },
      );
    }

    console.info("[reset-password]", {
      requestId,
      stage: "password_reset_complete",
      email: result.email,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json<AppApiError>(
        { error: "Invalid JSON body.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    if (error instanceof TimeoutError) {
      console.error("[reset-password]", { requestId, stage: "timeout", message: error.message });
      return NextResponse.json<AppApiError>(
        {
          error: "Password reset is temporarily unavailable.",
          code: "TIMEOUT",
          details: "Please try again in a moment.",
        },
        { status: 504 },
      );
    }

    console.error("[reset-password]", {
      requestId,
      stage: "unexpected_failure",
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });

    return NextResponse.json<AppApiError>(
      {
        error: "Password reset is temporarily unavailable.",
        code: "SERVER_ERROR",
        details: "Please try again shortly.",
      },
      { status: 500 },
    );
  }
}
