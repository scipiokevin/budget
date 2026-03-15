import { NextRequest, NextResponse } from "next/server";
import { getAppDataService } from "@/lib/services/app-data-service";
import { getCurrentUserId } from "@/lib/auth/session";
import { getExportDownload } from "@/lib/db/exports-store";
import type { ExportCreatePayload } from "@/types/contracts";

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const id = request.nextUrl.searchParams.get("id");
    const download = request.nextUrl.searchParams.get("download");

    if (id && download === "1") {
      const file = await getExportDownload(userId, id);
      if (!file) return NextResponse.json({ error: "Export not found." }, { status: 404 });

      return new NextResponse(file.content, {
        status: 200,
        headers: {
          "Content-Type": file.contentType,
          "Content-Disposition": `attachment; filename="${file.filename}"`,
        },
      });
    }

    const service = getAppDataService();
    const data = await service.getExports(userId);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load exports." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    const payload = (await request.json()) as ExportCreatePayload;
    const service = getAppDataService();
    const data = await service.createExport(userId, payload);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create export.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}