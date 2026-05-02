import { downloadSynologyImage, getSynologyUserMessage, isSynologyConfigError } from "@/lib/synology";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path") ?? "";

  if (!path) {
    return NextResponse.json({ message: "Missing Synology image path." }, { status: 400 });
  }

  try {
    const response = await downloadSynologyImage(path);
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    if (isSynologyConfigError(error)) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ message: getSynologyUserMessage(error) }, { status: 502 });
  }
}
