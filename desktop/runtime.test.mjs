import path from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import runtime from "./runtime.cjs";

const {
  buildServerEnvironment,
  getDesktopLogPath,
  getDesktopSettingsPath,
  getServerDirectory,
  hasRequiredDesktopSettings,
  isAllowedAppNavigation,
  isSafeExternalUrl,
  loadDesktopSettings,
  parseEnvContent,
  rotateLogIfNeeded,
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

  test("stores the desktop server log in the user data directory", () => {
    expect(getDesktopLogPath(path.join("Users", "local-user", "AppData", "Roaming", "NestCam"))).toBe(
      path.join("Users", "local-user", "AppData", "Roaming", "NestCam", "server.log"),
    );
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

  test("allows starting with Synology settings alone without Google Sheets", () => {
    expect(hasRequiredDesktopSettings({})).toBe(false);
    expect(
      hasRequiredDesktopSettings({
        SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
        SYNOLOGY_USERNAME: "local-user",
        SYNOLOGY_PASSWORD: "local-password",
        SYNOLOGY_DEFAULT_FOLDER: "/volume1/camera-folder",
      }),
    ).toBe(true);
  });

  test("accepts custom Supabase credentials without Google Sheets", () => {
    expect(
      hasRequiredDesktopSettings({
        NEXT_PUBLIC_SUPABASE_URL: "https://my-project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_12345",
        SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
        SYNOLOGY_USERNAME: "local-user",
        SYNOLOGY_PASSWORD: "local-password",
        SYNOLOGY_DEFAULT_FOLDER: "/volume1/camera-folder",
      }),
    ).toBe(true);
  });

  test("rejects partial Supabase credentials", () => {
    expect(
      hasRequiredDesktopSettings({
        NEXT_PUBLIC_SUPABASE_URL: "https://my-project.supabase.co",
        SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
        SYNOLOGY_USERNAME: "local-user",
        SYNOLOGY_PASSWORD: "local-password",
        SYNOLOGY_DEFAULT_FOLDER: "/volume1/camera-folder",
      }),
    ).toBe(false);
  });

  test("rejects partial Google Sheets credentials when Google Sheets is attempted", () => {
    expect(
      hasRequiredDesktopSettings({
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "nestcam@example.iam.gserviceaccount.com",
        SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
        SYNOLOGY_USERNAME: "local-user",
        SYNOLOGY_PASSWORD: "local-password",
        SYNOLOGY_DEFAULT_FOLDER: "/volume1/camera-folder",
      }),
    ).toBe(false);
  });

  test("accepts both Synology and complete Google Sheets settings", () => {
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

  test("encrypts sensitive settings on disk and decrypts them on load", () => {
    const userDataPath = mkdtempSync(path.join(tmpdir(), "nestcam-encrypt-"));
    const mockSafeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (str) => Buffer.from(`cipher_${str}`),
      decryptString: (buf) => buf.toString().replace(/^cipher_/, ""),
    };

    try {
      const saved = saveDesktopSettings(
        userDataPath,
        {
          SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
          SYNOLOGY_PASSWORD: "secret-password",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb-key-123",
        },
        { safeStorage: mockSafeStorage },
      );

      expect(saved.SYNOLOGY_PASSWORD).toBe("secret-password");
      expect(saved.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("sb-key-123");

      const diskRaw = JSON.parse(readFileSync(getDesktopSettingsPath(userDataPath), "utf8"));
      expect(diskRaw.SYNOLOGY_BASE_URL).toBe("http://192.168.12.166:5000");
      expect(diskRaw.SYNOLOGY_PASSWORD).toMatch(/^enc:/);
      expect(diskRaw.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toMatch(/^enc:/);

      const loaded = loadDesktopSettings(userDataPath, { safeStorage: mockSafeStorage });
      expect(loaded.SYNOLOGY_PASSWORD).toBe("secret-password");
      expect(loaded.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("sb-key-123");
    } finally {
      rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  test("loads existing unencrypted settings files backward-compatibly", () => {
    const userDataPath = mkdtempSync(path.join(tmpdir(), "nestcam-plain-"));

    try {
      writeFileSync(
        getDesktopSettingsPath(userDataPath),
        JSON.stringify({
          SYNOLOGY_BASE_URL: "http://192.168.12.166:5000",
          SYNOLOGY_PASSWORD: "plain-password",
        }),
        "utf8",
      );

      const loaded = loadDesktopSettings(userDataPath);
      expect(loaded.SYNOLOGY_PASSWORD).toBe("plain-password");
    } finally {
      rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  test("rotates log file when it exceeds the size limit", () => {
    const testDir = mkdtempSync(path.join(tmpdir(), "nestcam-log-"));
    const logPath = path.join(testDir, "server.log");

    try {
      writeFileSync(logPath, "x".repeat(100), "utf8");
      const rotated = rotateLogIfNeeded(logPath, { maxBytes: 50, maxBackups: 1 });
      expect(rotated).toBe(true);
      expect(readFileSync(`${logPath}.1`, "utf8")).toBe("x".repeat(100));

      const didNotRotate = rotateLogIfNeeded(logPath, { maxBytes: 200 });
      expect(didNotRotate).toBe(false);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("validates safe external URLs", () => {
    expect(isSafeExternalUrl("https://example.com")).toBe(true);
    expect(isSafeExternalUrl("http://example.com/page?foo=bar")).toBe(true);
    expect(isSafeExternalUrl("mailto:support@example.com")).toBe(true);

    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,test")).toBe(false);
    expect(isSafeExternalUrl("custom://launch")).toBe(false);
    expect(isSafeExternalUrl("not a url")).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
  });

  test("validates internal app navigation", () => {
    const serverUrl = "http://127.0.0.1:3210";

    expect(isAllowedAppNavigation("http://127.0.0.1:3210/dashboard", serverUrl)).toBe(true);
    expect(isAllowedAppNavigation("http://127.0.0.1:3210/api/check", serverUrl)).toBe(true);
    expect(isAllowedAppNavigation("data:text/html;charset=utf-8,hello", serverUrl)).toBe(true);

    expect(isAllowedAppNavigation("https://malicious.com/phish", serverUrl)).toBe(false);
    expect(isAllowedAppNavigation("http://127.0.0.1:5000", serverUrl)).toBe(false);
    expect(isAllowedAppNavigation("file:///path/to/file", serverUrl)).toBe(false);
  });
});
