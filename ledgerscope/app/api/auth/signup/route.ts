import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { TimeoutError, withTimeout } from "@/lib/utils/with-timeout";
import type { AppApiError } from "@/types/api-errors";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().email(),
  password: z.string().min(8),
});

const DB_TIMEOUT_MS = 8000;

type PrismaErrorWithCode = Error & { code?: string };
type SignupLogContext = {
  requestId: string;
  email?: string;
  stage: string;
  code?: string;
  details?: Record<string, unknown>;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hasPrismaErrorCode(error: unknown): error is PrismaErrorWithCode {
  return error instanceof Error && "code" in error;
}

function logSignupInfo(context: SignupLogContext) {
  console.info("[signup]", context);
}

function logSignupError(context: SignupLogContext, error: unknown) {
  const normalizedError =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          ...(hasPrismaErrorCode(error) ? { code: error.code } : {}),
        }
      : { value: String(error) };

  console.error("[signup]", { ...context, error: normalizedError });
}

function timeoutResponse(message: string) {
  return NextResponse.json<AppApiError>(
    {
      error: message,
      code: "TIMEOUT",
      details: "The request took too long. Please try again.",
    },
    { status: 504 },
  );
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<AppApiError>(
        {
          error: "Invalid signup payload.",
          code: "VALIDATION_ERROR",
          details: "Please check name, email, and password.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { name, password } = parsed.data;
    const email = normalizeEmail(parsed.data.email);
    logSignupInfo({
      requestId,
      email,
      stage: "validated",
      details: { hasName: Boolean(name), passwordLength: password.length },
    });

    const existing = await withTimeout(
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      DB_TIMEOUT_MS,
      "Signup lookup timed out.",
    );
    logSignupInfo({
      requestId,
      email,
      stage: "lookup_complete",
      details: { existingUser: Boolean(existing) },
    });

    if (existing) {
      return NextResponse.json<AppApiError>(
        { error: "Email is already registered.", code: "CONFLICT" },
        { status: 409 },
      );
    }

    const passwordHash = await withTimeout(hash(password, 12), DB_TIMEOUT_MS, "Password hashing timed out.");
    logSignupInfo({
      requestId,
      email,
      stage: "password_hashed",
    });

    const createdUser = await withTimeout(
      prisma.user.create({
        data: {
          name: name ?? null,
          email,
          passwordHash,
          onboardingCompletedAt: null,
        },
        select: { id: true, email: true },
      }),
      DB_TIMEOUT_MS,
      "Creating user timed out.",
    );
    logSignupInfo({
      requestId,
      email,
      stage: "user_created",
      details: { userId: createdUser.id },
    });

    if (!createdUser?.id) {
      logSignupError(
        {
          requestId,
          email,
          stage: "create_result_invalid",
        },
        new Error("User create returned no id"),
      );
      return NextResponse.json<AppApiError>(
        {
          error: "Account could not be created.",
          code: "SERVER_ERROR",
          details: "User creation did not return a valid record.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json<AppApiError>(
        { error: "Invalid JSON body.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    if (error instanceof TimeoutError) {
      logSignupError(
        {
          requestId,
          stage: "timeout",
        },
        error,
      );
      return timeoutResponse(error.message);
    }

    if (hasPrismaErrorCode(error) && error.code === "P2002") {
      logSignupError(
        {
          requestId,
          stage: "prisma_duplicate",
          code: error.code,
        },
        error,
      );
      return NextResponse.json<AppApiError>(
        { error: "Email is already registered.", code: "CONFLICT" },
        { status: 409 },
      );
    }

    logSignupError(
      {
        requestId,
        stage: "unexpected_failure",
        code: hasPrismaErrorCode(error) ? error.code : undefined,
      },
      error,
    );

    return NextResponse.json<AppApiError>(
      {
        error: "Failed to create user.",
        code: "SERVER_ERROR",
        details: "Signup is temporarily unavailable. Please try again.",
      },
      { status: 500 },
    );
  }
}
