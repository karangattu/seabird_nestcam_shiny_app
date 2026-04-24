import {
  getSynologyStatus,
  isSynologyConfigError,
  listSynologyImages,
} from "@/lib/synology";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const folder = url.searchParams.get("folder") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 300);
  const status = getSynologyStatus();

  if (!status.configured) {
    return NextResponse.json({ ...status, images: [] });
  }

  try {
    const images = await listSynologyImages(folder || status.defaultFolder, limit);
    return NextResponse.json({ ...status, images });
  } catch (error) {
    if (isSynologyConfigError(error)) {
      return NextResponse.json(
        { ...status, configured: false, images: [], message: error.message },
        { status: 400 },
      );
    }

    console.error(error);
    return NextResponse.json(
      { ...status, images: [], message: "Could not load images from Synology." },
      { status: 502 },
    );
  }
}
