import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { getFinancialHealthMetrics } from "@/lib/services/financial-health-service";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const data = await getFinancialHealthMetrics(userId);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load financial health metrics." }, { status: 500 });
  }
}
