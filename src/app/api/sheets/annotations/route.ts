import {
  appendAnnotationRows,
  isSheetConfigError,
  readSheetRows,
} from "@/lib/google-sheets";
import { ANNOTATION_COLUMNS, type AnnotationRecord } from "@/lib/annotation-data";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAnnotationRecord(value: unknown): value is AnnotationRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeRecord = value as Record<string, unknown>;
  return ANNOTATION_COLUMNS.every(
    (column) => typeof maybeRecord[column] === "string",
  );
}

export async function GET() {
  try {
    const sheet = await readSheetRows("annotations");
    return NextResponse.json({ configured: true, ...sheet });
  } catch (error) {
    if (isSheetConfigError(error)) {
      return NextResponse.json({
        configured: false,
        headers: [],
        rows: [],
        message: error.message,
      });
    }

    console.error(error);
    return NextResponse.json(
      {
        configured: true,
        headers: [],
        rows: [],
        message: "Could not load annotations from Google Sheets.",
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { annotations?: unknown };
    const annotations = Array.isArray(body.annotations) ? body.annotations : [];

    if (!annotations.length || !annotations.every(isAnnotationRecord)) {
      return NextResponse.json(
        { message: "Request body must include valid annotation rows." },
        { status: 400 },
      );
    }

    const result = await appendAnnotationRows(annotations);
    return NextResponse.json({
      ok: true,
      synced: annotations.length,
      updatedRows: result.updates?.updatedRows ?? annotations.length,
    });
  } catch (error) {
    if (isSheetConfigError(error)) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 503 },
      );
    }

    console.error(error);
    return NextResponse.json(
      { ok: false, message: "Could not sync annotations to Google Sheets." },
      { status: 502 },
    );
  }
}