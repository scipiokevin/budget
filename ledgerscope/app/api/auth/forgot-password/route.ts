import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createPasswordResetRequest,
  isPasswordResetEmailConfigured,
  sendPasswordResetEmail,
} from "@/lib/auth/password-reset";
import { TimeoutError, withTimeout } from "@/lib/utils/with-timeout";
import type { AppApiError } from "@/types/api-errors";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const DB_TIMEOUT_MS = 8000;

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const genericSuccess = {
    success: true,
    message: "If an account exists for that email, a password reset link is on its way.",
  };

  try {
    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<AppApiError>(
        {
          error: "Invalid forgot-password payload.",
          code: "VALIDATION_ERROR",
          details: "Please enter a valid email address.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const origin = new URL(request.url).origin;
    const resetRequest = await withTimeout(
      createPasswordResetRequest(parsed.data.email, origin),
      DB_TIMEOUT_MS,
      "Password reset request timed out.",
    );

    if (!resetRequest.shouldSendEmail || !resetRequest.email || !resetRequest.resetUrl) {
      console.info("[forgot-password]", {
        requestId,
        stage: "generic_success",
        providerConfigured: isPasswordResetEmailConfigured(),
      });
      return NextResponse.json(genericSuccess, { status: 202 });
    }

    try {
      const delivery = await withTimeout(
        sendPasswordResetEmail({
          email: resetRequest.email,
          name: resetRequest.name,
          resetUrl: resetRequest.resetUrl,
        }),
        DB_TIMEOUT_MS,
        "Password reset email timed out.",
      );

      console.info("[forgot-password]", {
        requestId,
        stage: "email_attempted",
        delivered: delivery.delivered,
        configured: delivery.configured,
      });
    } catch (error) {
      console.error("[forgot-password]", {
        requestId,
        stage: "email_failed",
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      });
    }

    return NextResponse.json(
      {
        ...genericSuccess,
        ...(resetRequest.previewResetUrl ? { previewResetUrl: resetRequest.previewResetUrl } : {}),
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json<AppApiError>(
        { error: "Invalid JSON body.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    if (error instanceof TimeoutError) {
      console.error("[forgot-password]", { requestId, stage: "timeout", message: error.message });
      return NextResponse.json<AppApiError>(
        {
          error: "Password reset is temporarily unavailable.",
          code: "TIMEOUT",
          details: "Please try again in a moment.",
        },
        { status: 504 },
      );
    }

    console.error("[forgot-password]", {
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
