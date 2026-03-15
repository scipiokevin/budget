import { NextRequest, NextResponse } from "next/server";
import { getAppDataService } from "@/lib/services/app-data-service";
import { getCurrentUserId } from "@/lib/auth/session";
import type { WatchlistMutationRequest } from "@/types/contracts";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const service = getAppDataService();
    const data = await service.getWatchlist(userId);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load watchlist." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const payload = (await request.json()) as WatchlistMutationRequest;
    const service = getAppDataService();
    const data = await service.mutateWatchlist(userId, payload);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update watchlist.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}