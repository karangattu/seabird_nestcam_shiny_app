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

  it("scopes cache by repository name and owner", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const isRepoA = url.includes("ownerA/repoA");
      return {
        ok: true,
        json: async () => ({
          tag_name: isRepoA ? "v1.0.0" : "v2.0.0",
          name: isRepoA ? "Release 1" : "Release 2",
          html_url: url,
          assets: [],
        }),
      };
    });

    const resA = await checkLatestRelease({
      fetchFn: mockFetch as unknown as typeof fetch,
      repoOwner: "ownerA",
      repoName: "repoA",
      currentVersion: "0.1.0",
    });

    const resB = await checkLatestRelease({
      fetchFn: mockFetch as unknown as typeof fetch,
      repoOwner: "ownerB",
      repoName: "repoB",
      currentVersion: "0.1.0",
    });

    expect(resA.latestVersion).toBe("1.0.0");
    expect(resB.latestVersion).toBe("2.0.0");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent requests for the same repository", async () => {
    let resolvePromise: (val: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    const mockFetch = vi.fn().mockReturnValue(
      pendingPromise.then(() => ({
        ok: true,
        json: async () => ({
          tag_name: "v0.4.0",
          name: "v0.4.0",
          html_url: "https://github.com/test",
          assets: [],
        }),
      }))
    );

    const call1 = checkLatestRelease({
      fetchFn: mockFetch as unknown as typeof fetch,
      currentVersion: "0.2.15",
    });
    const call2 = checkLatestRelease({
      fetchFn: mockFetch as unknown as typeof fetch,
      currentVersion: "0.2.15",
    });

    resolvePromise!(undefined);

    const [r1, r2] = await Promise.all([call1, call2]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(r1.latestVersion).toBe("0.4.0");
    expect(r2.latestVersion).toBe("0.4.0");
  });

  it("does not report an update when coalesced concurrent request fails", async () => {
    let resolvePromise: (val: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    const mockFetch = vi.fn().mockReturnValue(
      pendingPromise.then(() => ({
        ok: false,
        status: 403,
      }))
    );

    const callA = checkLatestRelease({
      fetchFn: mockFetch as unknown as typeof fetch,
      currentVersion: "0.3.0",
    });
    const callB = checkLatestRelease({
      fetchFn: mockFetch as unknown as typeof fetch,
      currentVersion: "0.2.15",
    });

    resolvePromise!(undefined);

    const [resA, resB] = await Promise.all([callA, callB]);

    expect(resA.updateAvailable).toBe(false);
    expect(resB.updateAvailable).toBe(false);
    expect(resA.error).toContain("403");
    expect(resB.error).toContain("403");
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
