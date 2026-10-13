import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import * as releaseChecker from "@/lib/release-checker";

describe("version API route", () => {
  it("returns version release check results", async () => {
    vi.spyOn(releaseChecker, "checkLatestRelease").mockResolvedValueOnce({
      currentVersion: "0.2.15",
      latestVersion: "0.2.16",
      updateAvailable: true,
      name: "v0.2.16",
      htmlUrl: "https://github.com/karangattu/seabird_nestcam_shiny_app/releases/tag/v0.2.16",
      assets: [],
    });

    const response = await GET();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.updateAvailable).toBe(true);
    expect(data.latestVersion).toBe("0.2.16");
    expect(data.currentVersion).toBe("0.2.15");
  });
});
