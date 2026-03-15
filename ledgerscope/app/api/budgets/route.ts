import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAppDataService } from "@/lib/services/app-data-service";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  invalidJsonResponse,
  parseJsonBody,
  parseSearchParams,
  serverErrorResponse,
  validationErrorResponse,
} from "@/lib/validation/api-validation";
import {
  budgetCreateSchema,
  budgetDeleteSchema,
  budgetUpdateSchema,
} from "@/lib/validation/schemas/budget";
import type { AppApiError } from "@/types/api-errors";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const service = getAppDataService();
    const data = await service.getBudgets(userId);
    return NextResponse.json(data);
  } catch {
    return serverErrorResponse("Failed to load budgets.");
  }
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const payload = await parseJsonBody(request, budgetCreateSchema);
    const service = getAppDataService();
    const data = await service.upsertBudget(userId, payload);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationErrorResponse(error);
    }
    if (error instanceof SyntaxError) {
      return invalidJsonResponse();
    }
    return serverErrorResponse("Failed to create budget.");
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const payload = await parseJsonBody(request, budgetUpdateSchema);
    const service = getAppDataService();
    const data = await service.upsertBudget(userId, payload);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return validationErrorResponse(error);
    }
    if (error instanceof SyntaxError) {
      return invalidJsonResponse();
    }
    return serverErrorResponse("Failed to update budget.");
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const { id } = parseSearchParams(request, budgetDeleteSchema);
    const service = getAppDataService();
    await service.deleteBudget(userId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationErrorResponse(error);
    }
    return NextResponse.json<AppApiError>(
      { error: "Failed to delete budget.", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
