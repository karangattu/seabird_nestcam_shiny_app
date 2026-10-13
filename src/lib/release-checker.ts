import { getCurrentVersion, isNewerVersion, normalizeVersion } from "./version";

export type ReleaseAsset = {
  name: string;
  downloadUrl: string;
  size: number;
};

export type ReleaseCheckResult = {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  name: string;
  htmlUrl: string;
  publishedAt?: string;
  body?: string;
  assets: ReleaseAsset[];
  error?: string;
};

type CacheEntry = {
  result: ReleaseCheckResult;
  timestamp: number;
};

const DEFAULT_REPO_OWNER = "karangattu";
const DEFAULT_REPO_NAME = "seabird_nestcam_shiny_app";
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

const cacheMap = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<ReleaseCheckResult>>();

export function clearReleaseCache(): void {
  cacheMap.clear();
  inFlightRequests.clear();
}

async function performReleaseFetch({
  repoOwner,
  repoName,
  fetchFn,
  currentVersion,
  cacheKey,
}: {
  repoOwner: string;
  repoName: string;
  fetchFn: typeof fetch;
  currentVersion: string;
  cacheKey: string;
}): Promise<ReleaseCheckResult> {
  const defaultResult: ReleaseCheckResult = {
    currentVersion,
    latestVersion: currentVersion,
    updateAvailable: false,
    name: "",
    htmlUrl: `https://github.com/${repoOwner}/${repoName}/releases`,
    assets: [],
  };

  try {
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;
    const response = await fetchFn(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Seabird-NestCam-App",
      },
    });

    if (!response.ok) {
      const errorMsg = `GitHub API returned ${response.status}`;
      return { ...defaultResult, error: errorMsg };
    }

    const data = await response.json();
    const tagName = typeof data.tag_name === "string" ? data.tag_name : "";
    const latestVersion = normalizeVersion(tagName) || currentVersion;
    const updateAvailable = isNewerVersion(currentVersion, latestVersion);

    const rawAssets = Array.isArray(data.assets) ? data.assets : [];
    const assets: ReleaseAsset[] = rawAssets
      .filter((asset: { name?: unknown; browser_download_url?: unknown }) =>
        typeof asset?.name === "string" && typeof asset?.browser_download_url === "string"
      )
      .map((asset: { name: string; browser_download_url: string; size?: number }) => ({
        name: asset.name,
        downloadUrl: asset.browser_download_url,
        size: typeof asset.size === "number" ? asset.size : 0,
      }));

    const result: ReleaseCheckResult = {
      currentVersion,
      latestVersion,
      updateAvailable,
      name: typeof data.name === "string" ? data.name : tagName,
      htmlUrl: typeof data.html_url === "string" ? data.html_url : defaultResult.htmlUrl,
      publishedAt: typeof data.published_at === "string" ? data.published_at : undefined,
      body: typeof data.body === "string" ? data.body : undefined,
      assets,
    };

    cacheMap.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...defaultResult,
      error: message,
    };
  }
}

export async function checkLatestRelease({
  repoOwner = process.env.GITHUB_REPO_OWNER || DEFAULT_REPO_OWNER,
  repoName = process.env.GITHUB_REPO_NAME || DEFAULT_REPO_NAME,
  fetchFn = fetch,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  forceRefresh = false,
  currentVersion = getCurrentVersion(),
}: {
  repoOwner?: string;
  repoName?: string;
  fetchFn?: typeof fetch;
  cacheTtlMs?: number;
  forceRefresh?: boolean;
  currentVersion?: string;
} = {}): Promise<ReleaseCheckResult> {
  const cacheKey = `${repoOwner}/${repoName}`;
  const now = Date.now();

  const cached = cacheMap.get(cacheKey);
  if (!forceRefresh && cached && now - cached.timestamp < cacheTtlMs) {
    return {
      ...cached.result,
      currentVersion,
      updateAvailable: isNewerVersion(currentVersion, cached.result.latestVersion),
    };
  }

  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    const coalesced = await inFlight;
    return {
      ...coalesced,
      currentVersion,
      updateAvailable: isNewerVersion(currentVersion, coalesced.latestVersion),
    };
  }

  const fetchPromise = performReleaseFetch({
    repoOwner,
    repoName,
    fetchFn,
    currentVersion,
    cacheKey,
  });

  inFlightRequests.set(cacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
