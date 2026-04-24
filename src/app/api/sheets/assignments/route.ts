import { readSheetRows, isSheetConfigError } from "@/lib/google-sheets";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const sheet = await readSheetRows("assignments");
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
        message: "Could not load assignments from Google Sheets.",
      },
      { status: 502 },
    );
  }
}