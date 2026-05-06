import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  createStatementImportFromPdf,
  createStatementImportFromSpreadsheet,
  getStatementImportHistory,
  previewStatementImportFromPdf,
} from "@/lib/db/statement-import-store";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const SPREADSHEET_EXTENSIONS = /\.(xlsx|xls|csv)$/i;
const SPREADSHEET_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
  "text/plain",
]);

// This route relies on Node primitives (Buffer) for PDF parsing.
export const runtime = "nodejs";

function isUploadedStatementFile(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value !== "object") return false;

  return (
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function" &&
    "name" in value &&
    typeof value.name === "string" &&
    "type" in value &&
    typeof value.type === "string" &&
    "size" in value &&
    typeof value.size === "number"
  );
}

function looksLikePdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function looksLikeSpreadsheet(file: File) {
  return SPREADSHEET_MIME_TYPES.has(file.type) || SPREADSHEET_EXTENSIONS.test(file.name);
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const history = await getStatementImportHistory(userId);
    return NextResponse.json(history);
  } catch (error) {
    console.error("Statement import history failed", error);
    return NextResponse.json({ error: "Failed to load statement import history." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") ?? "").toLowerCase();

    if (!isUploadedStatementFile(file)) {
      console.error("Statement import upload rejected: invalid file payload", {
        receivedType: file === null ? "null" : typeof file,
      });
        return NextResponse.json({ error: "A PDF, XLS, XLSX, or CSV file is required." }, { status: 400 });
    }

    const isPdf = looksLikePdf(file);
    const isSpreadsheet = looksLikeSpreadsheet(file);

    if (!isPdf && !isSpreadsheet) {
      return NextResponse.json({ error: "Only PDF, XLS, XLSX, and CSV imports are supported." }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "Import files must be smaller than 10 MB." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    console.info("Import upload received", {
      userId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      mode: mode || "create",
    });
    if (mode === "preview") {
      if (!isPdf) {
        return NextResponse.json({ error: "Preview mode is only available for PDF statements right now." }, { status: 400 });
      }

      const preview = await previewStatementImportFromPdf(userId, {
        filename: file.name,
        mimeType: file.type || "application/pdf",
        size: file.size,
        buffer: Buffer.from(arrayBuffer),
      });

      return NextResponse.json({ preview });
    }

    const response = await (isPdf ? createStatementImportFromPdf(userId, {
      filename: file.name,
      mimeType: file.type || "application/pdf",
      size: file.size,
      buffer: Buffer.from(arrayBuffer),
    }) : createStatementImportFromSpreadsheet(userId, {
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      buffer: Buffer.from(arrayBuffer),
    }));

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Import upload failed", error);
    return NextResponse.json({ error: "Failed to process the uploaded file." }, { status: 500 });
  }
}
