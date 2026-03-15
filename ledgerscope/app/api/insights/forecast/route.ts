import { NextResponse } from "next/server";
import { getAppDataService } from "@/lib/services/app-data-service";
import { getCurrentUserId } from "@/lib/auth/session";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const service = getAppDataService();
    const data = await service.getForecastOverview(userId);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load forecast insights." }, { status: 500 });
  }
}
