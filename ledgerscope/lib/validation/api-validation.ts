import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import type { AppApiError } from "@/types/api-errors";

export function validationErrorResponse(error: ZodError) {
  const fieldErrors = error.flatten().fieldErrors;
  return NextResponse.json<AppApiError>(
    {
      error: "Invalid request payload.",
      code: "VALIDATION_ERROR",
      details: "One or more fields are invalid.",
      fieldErrors,
    },
    { status: 400 },
  );
}

export function invalidJsonResponse() {
  return NextResponse.json<AppApiError>(
    {
      error: "Invalid JSON body.",
      code: "VALIDATION_ERROR",
      details: "Request body must be valid JSON.",
    },
    { status: 400 },
  );
}

export async function parseJsonBody<T>(request: NextRequest, schema: ZodSchema<T>) {
  const json = await request.json();
  return schema.parse(json);
}

export async function parseOptionalJsonBody<T>(request: NextRequest, schema: ZodSchema<T>, fallback: T) {
  const body = await request.text();
  if (!body.trim()) {
    return fallback;
  }

  const json = JSON.parse(body);
  return schema.parse(json);
}

export function parseSearchParams<T>(request: NextRequest, schema: ZodSchema<T>) {
  const object = Object.fromEntries(request.nextUrl.searchParams.entries());
  return schema.parse(object);
}

export function serverErrorResponse(message: string) {
  return NextResponse.json<AppApiError>({ error: message, code: "SERVER_ERROR" }, { status: 500 });
}
