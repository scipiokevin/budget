import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  cancelStatementImport,
  finalizeStatementImport,
  getStatementImportPreview,
  remapSpreadsheetImport,
} from "@/lib/db/statement-import-store";

const spreadsheetMappingSchema = z.object({
  dateColumn: z.string().min(1).optional(),
  descriptionColumn: z.string().min(1).optional(),
  merchantColumn: z.string().min(1).optional(),
  amountColumn: z.string().min(1).optional(),
  debitColumn: z.string().min(1).optional(),
  creditColumn: z.string().min(1).optional(),
  directionColumn: z.string().min(1).optional(),
  accountColumn: z.string().min(1).optional(),
});

const finalizeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm"),
    selectedEntryIds: z.array(z.string().min(1)).optional(),
  }),
  z.object({
    action: z.literal("cancel"),
  }),
  z.object({
    action: z.literal("remap"),
    mapping: spreadsheetMappingSchema,
  }),
]);

// This route relies on Node primitives (JSON parsing + Prisma) and should not run on Edge.
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const preview = await getStatementImportPreview(userId, id);
    if (!preview) return NextResponse.json({ error: "Statement import not found." }, { status: 404 });
    return NextResponse.json({ importPreview: preview });
  } catch (error) {
    console.error("Statement import preview failed", error);
    return NextResponse.json({ error: "Failed to load statement import." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload = finalizeSchema.parse(await request.json());
    const { id } = await context.params;

    if (payload.action === "cancel") {
      const ok = await cancelStatementImport(userId, id);
      if (!ok) return NextResponse.json({ error: "Statement import not found." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    if (payload.action === "remap") {
      const result = await remapSpreadsheetImport(userId, id, payload.mapping);
      if (!result) return NextResponse.json({ error: "Spreadsheet import not found." }, { status: 404 });
      return NextResponse.json(result);
    }

    const result = await finalizeStatementImport(userId, id, payload.selectedEntryIds);
    if (!result) return NextResponse.json({ error: "Statement import not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid statement import action." }, { status: 400 });
    }

    console.error("Statement import finalize failed", error);
    return NextResponse.json({ error: "Failed to finalize statement import." }, { status: 500 });
  }
}
