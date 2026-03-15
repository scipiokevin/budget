import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSandboxPublicTokenForUser } from "@/lib/plaid/integration";
import type { AppApiError } from "@/types/api-errors";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json<AppApiError>({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await createSandboxPublicTokenForUser();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json<AppApiError>(
      { error: "Failed to create sandbox public token.", code: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
