import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildSynologyBaseUrl,
  getSynologyStatus,
  getSynologyUserMessage,
  isAllowedSynologyPath,
  listSynologyFolders,
  listSynologyImages,
  downloadSynologyImage,
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

describe("Synology folder browsing", () => {
  afterEach(() => vi.unstubAllEnvs());
  function useNas() {
    vi.stubEnv("SYNOLOGY_BASE_URL", "http://nas.test:5000");
    vi.stubEnv("SYNOLOGY_USERNAME", "reader");
    vi.stubEnv("SYNOLOGY_PASSWORD", "test-password");
    vi.stubEnv("SYNOLOGY_DEFAULT_FOLDER", "/volume1/cameras/2024");
    vi.stubEnv("SYNOLOGY_ALLOWED_FOLDER_PREFIX", "/volume1");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const method = url.searchParams.get("method");
      if (method === "login") return Response.json({success: true, data: {sid: "session"}});
      if (method === "list_share") return Response.json({success: true, data: {shares: [
        {name: "cameras", path: "/cameras", isdir: true, additional: {real_path: "/volume1/cameras"}},
        {name: "other-volume", path: "/other-volume", isdir: true, additional: {real_path: "/volume2/other-volume"}},
      ]}});
      if (method === "list" && url.searchParams.get("folder_path") === "/cameras/2024") {
        const files = url.searchParams.get("filetype") === "dir"
          ? [{name: "site-a", path: "/cameras/2024/site-a", isdir: true, additional: {real_path: "/volume1/cameras/2024/site-a"}}]
          : [{name: "frame.jpg", path: "/cameras/2024/frame.jpg", isdir: false, additional: {size: 42}}];
        return Response.json({success: true, data: {files}});
      }
      if (method === "download" && url.searchParams.get("path") === JSON.stringify(["/cameras/2024/frame.jpg"])) {
        return new Response("image bytes", {headers: {"Content-Type": "image/jpeg"}});
      }
      return Response.json({success: false, error: {code: 408}});
    }));
  }

  test("starts at the saved folder and translates its shared-folder path", async () => {
    useNas();
    const result = await listSynologyFolders("");
    expect(result).toEqual({folder: "/volume1/cameras/2024", parentFolder: "/volume1/cameras", folders: [
      {name: "site-a", path: "/volume1/cameras/2024/site-a"},
    ]});
  });

  test("lists only shares within the allowed volume and stops at its root", async () => {
    useNas();
    expect(await listSynologyFolders("/volume1")).toEqual({folder: "/volume1", parentFolder: null, folders: [
      {name: "cameras", path: "/volume1/cameras"},
    ]});
  });

  test("blocks outside paths and parent traversal before contacting the NAS", async () => {
    useNas();
    for (const path of ["/volume2", "/volume1/../volume2", "/volume1/cameras/../../volume2"]) {
      await expect(listSynologyFolders(path)).rejects.toThrow(/outside the allowed folder prefix/);
    }
  });

  test("loads and downloads images from a volume path through the shared-folder API", async () => {
    useNas();
    const images = await listSynologyImages("/volume1/cameras/2024");
    expect(images[0].path).toBe("/volume1/cameras/2024/frame.jpg");
    const response = await downloadSynologyImage(images[0].path);
    expect(await response.text()).toBe("image bytes");
  });
});

describe("NAS request reuse", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
  async function client() {
    vi.resetModules();
    vi.stubEnv("SYNOLOGY_BASE_URL", "http://cache.test:5000");
    vi.stubEnv("SYNOLOGY_USERNAME", "reader");
    vi.stubEnv("SYNOLOGY_PASSWORD", "password");
    vi.stubEnv("SYNOLOGY_ALLOWED_FOLDER_PREFIX", "/volume1");
    return import("./synology");
  }
  test("shares login and path mapping across concurrent image requests, expires, and isolates credentials", async () => {
    const api = await client();
    let logins = 0, shares = 0;
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("method") === "login") { logins++; return Response.json({success:true,data:{sid:`sid-${logins}`}}); }
      if (url.searchParams.get("method") === "list_share") { shares++; return Response.json({success:true,data:{shares:[{path:"/cameras", additional:{real_path:"/volume1/cameras"}}]}}); }
      return new Response("image", {headers:{"Content-Type":"image/jpeg"}});
    }));
    await Promise.all(Array.from({length: 6}, () => api.downloadSynologyImage("/volume1/cameras/frame.jpg")));
    expect(logins).toBe(1); expect(shares).toBe(1);
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 11 * 60_000);
    await api.downloadSynologyImage("/volume1/cameras/frame.jpg");
    expect(logins).toBe(2);
    vi.stubEnv("SYNOLOGY_PASSWORD", "changed");
    await api.downloadSynologyImage("/volume1/cameras/frame.jpg");
    expect(logins).toBe(3);
  });
  test("renews an expired NAS session once and requests a small thumbnail", async () => {
    const api = await client();
    let logins = 0;
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("method") === "login") { logins++; return Response.json({success:true,data:{sid:`sid-${logins}`}}); }
      if (url.searchParams.get("method") === "list_share") return Response.json({success:true,data:{shares:[{path:"/cameras", additional:{real_path:"/volume1/cameras"}}]}});
      if (url.searchParams.get("_sid") === "sid-1") return Response.json({success:false,error:{code:106}});
      expect(url.searchParams.get("api")).toBe("SYNO.FileStation.Thumb");
      expect(url.searchParams.get("size")).toBe("small");
      expect(url.searchParams.get("path")).toBe(JSON.stringify("/cameras/frame.jpg"));
      return new Response("thumbnail", {headers:{"Content-Type":"image/jpeg"}});
    }));
    const response = await api.downloadSynologyImage("/volume1/cameras/frame.jpg", true);
    expect(await response.text()).toBe("thumbnail"); expect(logins).toBe(2);
  });
});
