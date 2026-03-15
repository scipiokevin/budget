import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { dismissSmartInsightInPrisma } from "@/lib/db/smart-insights-store";
import type { AppApiError } from "@/types/api-errors";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, { params }: Params) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json<AppApiError>({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const removed = await dismissSmartInsightInPrisma(userId, id);
    if (!removed) {
      return NextResponse.json<AppApiError>({ error: "Insight not found.", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json<AppApiError>({ error: "Failed to dismiss insight.", code: "SERVER_ERROR" }, { status: 500 });
  }
}