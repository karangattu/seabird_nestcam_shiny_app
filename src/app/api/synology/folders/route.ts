import { NextResponse } from "next/server";
import { getSynologyUserMessage, isSynologyConfigError, listSynologyFolders } from "@/lib/synology";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const folder = new URL(request.url).searchParams.get("folder") ?? "";
    return NextResponse.json(await listSynologyFolders(folder));
  } catch (error) {
    return NextResponse.json(
      {message: isSynologyConfigError(error) ? error.message : getSynologyUserMessage(error)},
      {status: isSynologyConfigError(error) ? 400 : 502},
    );
  }
}
