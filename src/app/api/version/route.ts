import { NextResponse } from "next/server";
import { checkLatestRelease } from "@/lib/release-checker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await checkLatestRelease();
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, max-age=900, stale-while-revalidate=1800",
    },
  });
}
