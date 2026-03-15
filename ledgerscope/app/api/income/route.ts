import { NextResponse } from "next/server";
import { getAppDataService } from "@/lib/services/app-data-service";

export async function GET() {
  try {
    const service = getAppDataService();
    const data = await service.getIncome();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load resource." }, { status: 500 });
  }
}
