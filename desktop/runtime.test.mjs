import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import runtime from "./runtime.cjs";

const {
  buildServerEnvironment,
  getServerDirectory,
  hasRequiredDesktopSettings,
  loadDesktopSettings,
  parseEnvContent,
  saveDesktopSettings,
} = runtime;

describe("desktop runtime", () => {
  test("uses Electron resources for packaged server files", () => {
    expect(
      getServerDirectory({
        isPackaged: true,
        resourcesPath: path.join("Applications", "NestCam.app", "Contents", "Resources"),
        cwd: "ignored",
      }),
    ).toBe(path.join("Applications", "NestCam.app", "Contents", "Resources", "server"));
  });

  test("uses the prepared desktop runtime during development", () => {
    expect(
      getServerDirectory({
        isPackaged: false,
        resourcesPath: "ignored",
        cwd: path.join("repo", "root"),
      }),
    ).toBe(path.join("repo", "root", "desktop-runtime", "server"));
  });

  test("parses env files with optional quotes", () => {
    expect(
      parseEnvContent(`
SYNOLOGY_BASE_URL=http://192.168.12.166:5000
SYNOLOGY_USERNAME="local-user"
SYNOLOGY_PASSWORD='local-password'
# ignored
`),
    ).toEqual({
      SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
      SYNOLOGY_USERNAME: "local-user",
      SYNOLOGY_PASSWORD: "local-password",
    });
  });

  test("passes saved desktop settings to the server child process", () => {
    expect(
      buildServerEnvironment({
        baseEnv: { PATH: "/usr/bin", SYNOLOGY_USERNAME: "shell-user" },
        envValues: { SYNOLOGY_USERNAME: "bundled-user" },
        desktopSettings: { SYNOLOGY_USERNAME: "saved-user" },
        port: 3210,
      }),
    ).toMatchObject({
      PATH: "/usr/bin",
      SYNOLOGY_USERNAME: "saved-user",
      PORT: "3210",
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    });
  });

  test("loads saved desktop settings from the user data directory", () => {
    const userDataPath = mkdtempSync(path.join(tmpdir(), "nestcam-settings-"));

    try {
      saveDesktopSettings(userDataPath, {
        SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
        SYNOLOGY_USERNAME: "local-user",
      });

      expect(loadDesktopSettings(userDataPath)).toMatchObject({
        SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
        SYNOLOGY_USERNAME: "local-user",
      });
    } finally {
      rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  test("requires Synology and Google Sheets settings before the desktop server can start", () => {
    expect(hasRequiredDesktopSettings({})).toBe(false);
    expect(
      hasRequiredDesktopSettings({
        SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
        SYNOLOGY_USERNAME: "local-user",
        SYNOLOGY_PASSWORD: "local-password",
        SYNOLOGY_DEFAULT_FOLDER: "/volume1/camera-folder",
      }),
    ).toBe(false);
    expect(
      hasRequiredDesktopSettings({
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "nestcam@example.iam.gserviceaccount.com",
        GOOGLE_PRIVATE_KEY: "private-key",
        GOOGLE_SHEETS_SPREADSHEET_ID: "spreadsheet-id",
        SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
        SYNOLOGY_USERNAME: "local-user",
        SYNOLOGY_PASSWORD: "local-password",
        SYNOLOGY_DEFAULT_FOLDER: "/volume1/camera-folder",
      }),
    ).toBe(true);
  });
});
