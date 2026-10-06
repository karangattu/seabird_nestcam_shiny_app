import { beforeEach, describe, expect, test, vi } from "vitest";
import updaterModule from "./updater.cjs";

const { initAutoUpdater } = updaterModule;

describe("desktop updater", () => {
  let listeners;
  let mockAutoUpdater;
  let mockApp;
  let mockDialog;
  let mockShell;
  let mockElectron;

  beforeEach(() => {
    listeners = new Map();
    mockAutoUpdater = {
      autoDownload: true,
      autoInstallOnAppQuit: false,
      logger: null,
      on: vi.fn((event, handler) => {
        listeners.set(event, handler);
        return mockAutoUpdater;
      }),
      checkForUpdates: vi.fn().mockResolvedValue({}),
      downloadUpdate: vi.fn().mockResolvedValue([]),
      quitAndInstall: vi.fn(),
    };

    mockApp = {
      isPackaged: false,
      getVersion: vi.fn().mockReturnValue("0.2.12"),
    };

    mockDialog = {
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
    };

    mockShell = {
      openExternal: vi.fn(),
    };

    mockElectron = {
      app: mockApp,
      dialog: mockDialog,
      shell: mockShell,
    };
  });

  test("handles development mode without checking remote updates", () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const updater = initAutoUpdater({
      logger,
      electron: mockElectron,
      updaterInstance: mockAutoUpdater,
    });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("dev mode"));

    updater.checkForUpdates({ manual: true });
    expect(mockDialog.showMessageBox).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ title: "Development Mode" })
    );
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  test("initializes listeners and checks for updates when packaged", async () => {
    mockApp.isPackaged = true;
    const logger = { info: vi.fn(), error: vi.fn() };
    const onBeforeQuitAndInstall = vi.fn().mockResolvedValue(undefined);

    const updater = initAutoUpdater({
      logger,
      onBeforeQuitAndInstall,
      electron: mockElectron,
      updaterInstance: mockAutoUpdater,
    });

    expect(mockAutoUpdater.autoDownload).toBe(false);
    expect(mockAutoUpdater.on).toHaveBeenCalledWith("update-available", expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith("update-downloaded", expect.any(Function));

    updater.checkForUpdates({ manual: true });
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();

    const onUpdateAvailable = listeners.get("update-available");
    mockDialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await onUpdateAvailable({ version: "0.3.0", releaseNotes: "New features" });

    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled();

    const onUpdateDownloaded = listeners.get("update-downloaded");
    mockDialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await onUpdateDownloaded({ version: "0.3.0" });

    expect(onBeforeQuitAndInstall).toHaveBeenCalled();
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();
  });

  test("shows no update message when manually checked and none available", () => {
    mockApp.isPackaged = true;
    const updater = initAutoUpdater({
      electron: mockElectron,
      updaterInstance: mockAutoUpdater,
    });
    updater.checkForUpdates({ manual: true });

    const onNotAvailable = listeners.get("update-not-available");
    onNotAvailable({ version: "0.2.12" });

    expect(mockDialog.showMessageBox).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ title: "No Updates Available" })
    );
  });
});
