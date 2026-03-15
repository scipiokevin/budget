import { NextRequest, NextResponse } from "next/server";
import { ingestPlaidWebhook } from "@/lib/plaid/integration";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const result = await ingestPlaidWebhook(payload);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ accepted: true, stored: false }, { status: 200 });
  }
}
