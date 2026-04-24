import { describe, expect, test } from "vitest";
import { buildSynologyBaseUrl, getSynologyStatus, isAllowedSynologyPath } from "./synology";

describe("Synology configuration", () => {
  test("builds a File Station base URL from host and port", () => {
    expect(
      buildSynologyBaseUrl({ baseUrl: "https://nas.example.com", port: "5001" }),
    ).toBe("https://nas.example.com:5001");
  });

  test("reports missing NAS credentials without exposing values", () => {
    const status = getSynologyStatus({});

    expect(status.configured).toBe(false);
    expect(status.missing).toEqual([
      "SYNOLOGY_BASE_URL",
      "SYNOLOGY_USERNAME",
      "SYNOLOGY_PASSWORD",
    ]);
    expect(JSON.stringify(status)).not.toContain("password");
  });

  test("restricts image proxy paths to the configured folder prefix", () => {
    expect(
      isAllowedSynologyPath("/volume1/cameras/site-a/image.jpg", "/volume1/cameras"),
    ).toBe(true);
    expect(
      isAllowedSynologyPath("/volume1/private/image.jpg", "/volume1/cameras"),
    ).toBe(false);
  });
});
