import { NextResponse } from "next/server";
import { checkLatestRelease } from "@/lib/release-checker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  const result = await checkLatestRelease({ forceRefresh });
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, max-age=900, stale-while-revalidate=1800",
    },
  });
}
