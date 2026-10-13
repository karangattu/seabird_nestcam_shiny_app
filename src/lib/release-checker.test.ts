import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkLatestRelease, clearReleaseCache } from "./release-checker";

describe("release-checker", () => {
  beforeEach(() => {
    clearReleaseCache();
  });

  it("identifies when an update is available from GitHub Releases", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v0.3.0",
        name: "v0.3.0: Major Update",
        html_url: "https://github.com/karangattu/seabird_nestcam_shiny_app/releases/tag/v0.3.0",
        published_at: "2026-10-10T12:00:00Z",
        body: "Release notes here",
        assets: [
          {
            name: "Seabird-Setup-0.3.0.exe",
            browser_download_url: "https://github.com/download/exe",
            size: 1048576,
          },
        ],
      }),
    });

    const result = await checkLatestRelease({
      fetchFn: mockFetch as unknown as typeof fetch,
      currentVersion: "0.2.15",
    });

    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe("0.3.0");
    expect(result.currentVersion).toBe("0.2.15");
    expect(result.name).toBe("v0.3.0: Major Update");
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].name).toBe("Seabird-Setup-0.3.0.exe");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("handles when the current version is already up to date", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v0.2.15",
        name: "v0.2.15",
        html_url: "https://github.com/karangattu/seabird_nestcam_shiny_app/releases/tag/v0.2.15",
        assets: [],
      }),
    });

    const result = await checkLatestRelease({
      fetchFn: mockFetch as unknown as typeof fetch,
      currentVersion: "0.2.15",
    });

    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBe("0.2.15");
  });

  it("uses cached release data when within TTL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v0.3.0",
        name: "v0.3.0",
        html_url: "https://github.com/karangattu/seabird_nestcam_shiny_app/releases/tag/v0.3.0",
        assets: [],
      }),
    });

    await checkLatestRelease({
      fetchFn: mockFetch as unknown as typeof fetch,
      currentVersion: "0.2.15",
      cacheTtlMs: 60000,
    });

    const secondResult = await checkLatestRelease({
      fetchFn: mockFetch as unknown as typeof fetch,
      currentVersion: "0.2.15",
      cacheTtlMs: 60000,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(secondResult.updateAvailable).toBe(true);
  });

  it("gracefully handles GitHub API failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });

    const result = await checkLatestRelease({
      fetchFn: mockFetch as unknown as typeof fetch,
      currentVersion: "0.2.15",
    });

    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("403");
  });
});
