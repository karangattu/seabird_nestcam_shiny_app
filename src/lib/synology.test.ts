import { describe, expect, test } from "vitest";
import {
  buildSynologyBaseUrl,
  getSynologyStatus,
  getSynologyUserMessage,
  isAllowedSynologyPath,
} from "./synology";

describe("Synology configuration", () => {
  test("builds a File Station base URL from host and port", () => {
    expect(
      buildSynologyBaseUrl({ baseUrl: "https://nas.example.com", port: "5001" }),
    ).toBe("https://nas.example.com:5001");
  });

  test("keeps the LAN protocol and port when using the R script NAS URL", () => {
    expect(
      buildSynologyBaseUrl({ baseUrl: "http://192.168.12.166:5000", port: "5001" }),
    ).toBe("http://192.168.12.166:5000");
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

  test("explains connection timeouts as local network reachability problems", () => {
    const error = new TypeError("fetch failed", {
      cause: Object.assign(new Error("Connect Timeout Error"), {
        code: "UND_ERR_CONNECT_TIMEOUT",
      }),
    });

    expect(getSynologyUserMessage(error)).toContain("could not connect to the Synology NAS");
    expect(getSynologyUserMessage(error)).toContain("same network");
  });
});
