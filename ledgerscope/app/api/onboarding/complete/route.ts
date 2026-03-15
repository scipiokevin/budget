import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import type { AppApiError } from "@/types/api-errors";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json<AppApiError>({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json<AppApiError>({ error: "Failed to complete onboarding.", code: "SERVER_ERROR" }, { status: 500 });
  }
}
