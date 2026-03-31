import { NextRequest, NextResponse } from "next/server";
import { ingestPlaidWebhook } from "@/lib/plaid/integration";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("Plaid-Verification");

  try {
    const result = await ingestPlaidWebhook(rawBody, signatureHeader);
    const status = result.accepted ? 200 : 401;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error("[plaid] webhook route failed", error);
    return NextResponse.json({ accepted: false, stored: false, verified: false }, { status: 500 });
  }
}
