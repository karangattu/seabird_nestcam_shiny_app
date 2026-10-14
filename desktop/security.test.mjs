import path from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, test, vi } from "vitest";
import runtime from "./runtime.cjs";
import updaterModule from "./updater.cjs";

const {
  isAllowedAppNavigation,
  isSafeExternalUrl,
  loadDesktopSettings,
  rotateLogIfNeeded,
  saveDesktopSettings,
} = runtime;
const { initAutoUpdater } = updaterModule;

describe("desktop security and lifecycle improvements", () => {
  test("strictly allows safe external URL protocols and rejects unsafe schemes", () => {
    expect(isSafeExternalUrl("https://github.com")).toBe(true);
    expect(isSafeExternalUrl("http://127.0.0.1:3210")).toBe(true);
    expect(isSafeExternalUrl("mailto:test@example.org")).toBe(true);

    expect(isSafeExternalUrl("file:///etc/hosts")).toBe(false);
    expect(isSafeExternalUrl("file://C:/Windows/System32/calc.exe")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeExternalUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeExternalUrl("custom-proto://execute")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
    expect(isSafeExternalUrl(undefined)).toBe(false);
  });

  test("confines renderer navigation to internal serverUrl origin and status data: URLs", () => {
    const serverUrl = "http://127.0.0.1:4000";

    expect(isAllowedAppNavigation("http://127.0.0.1:4000/", serverUrl)).toBe(true);
    expect(isAllowedAppNavigation("http://127.0.0.1:4000/annotate?id=123", serverUrl)).toBe(true);
    expect(isAllowedAppNavigation("data:text/html;charset=utf-8,%3Ch1%3ELoading%3C/h1%3E", serverUrl)).toBe(true);

    expect(isAllowedAppNavigation("http://127.0.0.1:4001/", serverUrl)).toBe(false);
    expect(isAllowedAppNavigation("http://localhost:4000/", serverUrl)).toBe(false);
    expect(isAllowedAppNavigation("https://external-website.com/", serverUrl)).toBe(false);
    expect(isAllowedAppNavigation("file:///local/path", serverUrl)).toBe(false);
    expect(isAllowedAppNavigation("", serverUrl)).toBe(false);
    expect(isAllowedAppNavigation("http://127.0.0.1:4000/", "")).toBe(false);
  });

  test("encrypts multiple sensitive fields and handles decryption fallback", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "nestcam-sec-"));
    const mockSafeStorage = {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn((str) => Buffer.from(`enc_${str}`)),
      decryptString: vi.fn((buf) => buf.toString().replace(/^enc_/, "")),
    };

    try {
      const input = {
        SYNOLOGY_BASE_URL: "http://nas.local:5000",
        SYNOLOGY_PASSWORD: "nas-secret-password",
        GOOGLE_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "supabase-publishable-key",
      };

      const returned = saveDesktopSettings(tempDir, input, { safeStorage: mockSafeStorage });
      expect(returned.SYNOLOGY_PASSWORD).toBe("nas-secret-password");
      expect(returned.GOOGLE_PRIVATE_KEY).toContain("RSA PRIVATE KEY");

      const fileContent = JSON.parse(readFileSync(path.join(tempDir, "desktop-settings.json"), "utf8"));
      expect(fileContent.SYNOLOGY_BASE_URL).toBe("http://nas.local:5000");
      expect(fileContent.SYNOLOGY_PASSWORD).toMatch(/^enc:/);
      expect(fileContent.GOOGLE_PRIVATE_KEY).toMatch(/^enc:/);
      expect(fileContent.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toMatch(/^enc:/);

      const decrypted = loadDesktopSettings(tempDir, { safeStorage: mockSafeStorage });
      expect(decrypted.SYNOLOGY_PASSWORD).toBe("nas-secret-password");
      expect(decrypted.GOOGLE_PRIVATE_KEY).toContain("RSA PRIVATE KEY");
      expect(decrypted.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("supabase-publishable-key");

      const unencryptedSafeStorage = {
        isEncryptionAvailable: () => false,
      };
      const loadedWithoutKeyring = loadDesktopSettings(tempDir, { safeStorage: unencryptedSafeStorage });
      expect(loadedWithoutKeyring.SYNOLOGY_BASE_URL).toBe("http://nas.local:5000");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("rotates log files above threshold and preserves backup", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "nestcam-log-rot-"));
    const logPath = path.join(tempDir, "server.log");

    try {
      expect(rotateLogIfNeeded(logPath)).toBe(false);

      writeFileSync(logPath, "short log", "utf8");
      expect(rotateLogIfNeeded(logPath, { maxBytes: 1000 })).toBe(false);

      writeFileSync(logPath, "A".repeat(500), "utf8");
      expect(rotateLogIfNeeded(logPath, { maxBytes: 200, maxBackups: 1 })).toBe(true);
      expect(readFileSync(`${logPath}.1`, "utf8")).toBe("A".repeat(500));

      writeFileSync(logPath, "B".repeat(500), "utf8");
      expect(rotateLogIfNeeded(logPath, { maxBytes: 200, maxBackups: 1 })).toBe(true);
      expect(readFileSync(`${logPath}.1`, "utf8")).toBe("B".repeat(500));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("updater handles download failure and cleans up window progress bar", async () => {
    const listeners = new Map();
    const mockAutoUpdater = {
      autoDownload: false,
      autoInstallOnAppQuit: true,
      on: vi.fn((event, handler) => {
        listeners.set(event, handler);
        return mockAutoUpdater;
      }),
      downloadUpdate: vi.fn().mockRejectedValue(new Error("Network timeout")),
    };

    const mockWin = {
      isDestroyed: () => false,
      setProgressBar: vi.fn(),
      webContents: { send: vi.fn() },
    };

    const mockDialog = {
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
    };

    const updater = initAutoUpdater({
      electron: {
        app: { isPackaged: true },
        dialog: mockDialog,
        shell: { openExternal: vi.fn() },
      },
      updaterInstance: mockAutoUpdater,
      getMainWindow: () => mockWin,
    });

    const onUpdateAvailable = listeners.get("update-available");
    await onUpdateAvailable({ version: "1.0.0" });

    expect(mockWin.setProgressBar).toHaveBeenCalledWith(-1);
    expect(updater.getStatus()).toEqual({ isDownloading: false, isManualCheck: false });
  });
});
