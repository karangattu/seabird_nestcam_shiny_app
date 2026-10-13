import fs from "node:fs";
import path from "node:path";

export const FALLBACK_APP_VERSION = "0.2.15";

export function normalizeVersion(versionStr?: string | null): string {
  if (!versionStr) return "0.0.0";
  const trimmed = versionStr.trim();
  return trimmed.replace(/^[vV]/, "").trim();
}

function comparePrereleaseIdentifiers(id1: string, id2: string): number {
  const isNum1 = /^\d+$/.test(id1);
  const isNum2 = /^\d+$/.test(id2);

  if (isNum1 && isNum2) {
    const n1 = Number.parseInt(id1, 10);
    const n2 = Number.parseInt(id2, 10);
    if (n1 !== n2) return n1 > n2 ? 1 : -1;
    return 0;
  }

  if (isNum1 && !isNum2) return -1;
  if (!isNum1 && isNum2) return 1;

  if (id1 !== id2) return id1 > id2 ? 1 : -1;
  return 0;
}

function comparePrereleases(pre1: string | null, pre2: string | null): number {
  if (pre1 === null && pre2 === null) return 0;
  if (pre1 === null && pre2 !== null) return 1;
  if (pre1 !== null && pre2 === null) return -1;

  const parts1 = (pre1 as string).split(".");
  const parts2 = (pre2 as string).split(".");
  const minLen = Math.min(parts1.length, parts2.length);

  for (let i = 0; i < minLen; i++) {
    const diff = comparePrereleaseIdentifiers(parts1[i], parts2[i]);
    if (diff !== 0) return diff;
  }

  if (parts1.length !== parts2.length) {
    return parts1.length > parts2.length ? 1 : -1;
  }

  return 0;
}

export function parseSemver(versionStr: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
} {
  const normalized = normalizeVersion(versionStr);
  const withoutBuild = normalized.split("+")[0];
  const [core, ...prereleaseParts] = withoutBuild.split("-");
  const prerelease = prereleaseParts.length ? prereleaseParts.join("-") : null;
  const parts = core.split(".").map((part) => {
    const num = Number.parseInt(part, 10);
    return Number.isNaN(num) ? 0 : num;
  });

  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0,
    prerelease,
  };
}

export function compareVersions(v1: string, v2: string): number {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  return comparePrereleases(p1.prerelease, p2.prerelease);
}

export function isNewerVersion(currentVersion: string, candidateVersion: string): boolean {
  return compareVersions(candidateVersion, currentVersion) > 0;
}

export function getCurrentVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    if (fs.existsSync(pkgPath)) {
      const data = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (typeof data.version === "string" && data.version.trim()) {
        return data.version.trim();
      }
    }
  } catch {}
  return FALLBACK_APP_VERSION;
}
