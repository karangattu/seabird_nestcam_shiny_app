import { describe, expect, it } from "vitest";
import {
  compareVersions,
  getCurrentVersion,
  isNewerVersion,
  normalizeVersion,
  parseSemver,
} from "./version";

describe("version utilities", () => {
  it("normalizes version strings with leading v or whitespace", () => {
    expect(normalizeVersion("v0.2.15")).toBe("0.2.15");
    expect(normalizeVersion("V1.0.0")).toBe("1.0.0");
    expect(normalizeVersion(" 0.2.15 ")).toBe("0.2.15");
    expect(normalizeVersion("")).toBe("0.0.0");
    expect(normalizeVersion(null)).toBe("0.0.0");
  });

  it("parses semver correctly including prereleases and build metadata", () => {
    expect(parseSemver("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    });
    expect(parseSemver("v2.0.1-beta.1")).toEqual({
      major: 2,
      minor: 0,
      patch: 1,
      prerelease: "beta.1",
    });
    expect(parseSemver("v2.0.1-beta.1+build.2024")).toEqual({
      major: 2,
      minor: 0,
      patch: 1,
      prerelease: "beta.1",
    });
  });

  it("compares versions accurately across major, minor, patch, and prerelease", () => {
    expect(compareVersions("0.2.16", "0.2.15")).toBe(1);
    expect(compareVersions("0.2.15", "0.2.16")).toBe(-1);
    expect(compareVersions("0.2.15", "0.2.15")).toBe(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.3.0", "0.2.9")).toBe(1);
    expect(compareVersions("0.2.15", "0.2.15-beta")).toBe(1);
    expect(compareVersions("0.2.15-alpha", "0.2.15-beta")).toBe(-1);
  });

  it("correctly compares numeric dot-separated prerelease identifiers", () => {
    expect(compareVersions("0.2.16-beta.10", "0.2.16-beta.2")).toBe(1);
    expect(compareVersions("0.2.16-beta.2", "0.2.16-beta.10")).toBe(-1);
    expect(compareVersions("1.0.0-rc.11", "1.0.0-rc.9")).toBe(1);
    expect(compareVersions("1.0.0-rc.9", "1.0.0-rc.11")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha")).toBe(1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.beta", "1.0.0-alpha.1")).toBe(1);
    expect(compareVersions("1.0.0-beta.9007199254740993", "1.0.0-beta.9007199254740992")).toBe(1);
  });

  it("detects newer versions correctly", () => {
    expect(isNewerVersion("0.2.15", "0.2.16")).toBe(true);
    expect(isNewerVersion("0.2.15", "v0.2.16")).toBe(true);
    expect(isNewerVersion("0.2.15", "0.3.0")).toBe(true);
    expect(isNewerVersion("0.2.15", "1.0.0")).toBe(true);
    expect(isNewerVersion("0.2.15", "0.2.15")).toBe(false);
    expect(isNewerVersion("0.2.15", "0.2.14")).toBe(false);
    expect(isNewerVersion("0.2.15", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.2.15-beta.2", "0.2.15-beta.10")).toBe(true);
    expect(isNewerVersion("0.2.15-beta.10", "0.2.15-beta.2")).toBe(false);
  });

  it("retrieves the current package version", () => {
    const version = getCurrentVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
