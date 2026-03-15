import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAppDataService } from "@/lib/services/app-data-service";
import { getCurrentUserId } from "@/lib/auth/session";
import { setTripAssignmentInPrisma } from "@/lib/db/insights-store";

const tripAssignmentSchema = z.object({
  transactionId: z.string().min(1),
  tripId: z.string().min(1).nullable().optional(),
});

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const service = getAppDataService();
    const data = await service.getInsights(userId);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load resource." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const payload = tripAssignmentSchema.parse(await request.json());
    const ok = await setTripAssignmentInPrisma(userId, payload.transactionId, payload.tripId ?? null);

    if (!ok) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid trip assignment payload.", details: error.flatten() }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to update trip assignment." }, { status: 500 });
  }
}