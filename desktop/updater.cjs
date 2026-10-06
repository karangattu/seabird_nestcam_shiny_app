function getElectronModules() {
  try {
    return require("electron");
  } catch {
    return {};
  }
}

function initAutoUpdater({
  logger,
  getMainWindow,
  onBeforeQuitAndInstall,
  electron = getElectronModules(),
  updaterInstance,
} = {}) {
  const app = electron?.app;
  const dialog = electron?.dialog;
  const shell = electron?.shell;

  if (!app || !app.isPackaged) {
    logger?.info?.("Auto-updater disabled in unpackaged/dev mode.");
    return {
      checkForUpdates: ({ manual = false } = {}) => {
        if (manual && dialog) {
          dialog.showMessageBox(getMainWindow?.() ?? null, {
            type: "info",
            title: "Development Mode",
            message: "In-app updates are disabled in development mode.",
            detail: "Updates are checked and downloaded in the packaged desktop app.",
            buttons: ["OK"],
          });
        }
      },
    };
  }

  const autoUpdater = updaterInstance || require("electron-updater").autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  if (logger) {
    autoUpdater.logger = logger;
  }

  let isManualCheck = false;
  let isDownloading = false;

  autoUpdater.on("checking-for-update", () => {
    logger?.info?.("Checking for updates...");
  });

  autoUpdater.on("update-available", async (info) => {
    logger?.info?.(`Update available: v${info.version}`);
    const win = getMainWindow?.();
    const result = await dialog.showMessageBox(win ?? null, {
      type: "info",
      title: "Update Available",
      message: `A new version (v${info.version}) is available.`,
      detail: info.releaseNotes
        ? typeof info.releaseNotes === "string"
          ? info.releaseNotes.replace(/<[^>]*>/g, "")
          : "Release notes available on GitHub."
        : "Would you like to download and install this update now?",
      buttons: ["Download and Install", "Later"],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      isDownloading = true;
      try {
        await autoUpdater.downloadUpdate();
      } catch (err) {
        isDownloading = false;
        logger?.error?.(`Failed to download update: ${err.message}`);
        dialog
          .showMessageBox(win ?? null, {
            type: "error",
            title: "Download Failed",
            message: `Failed to download update: ${err.message}`,
            buttons: ["View on GitHub", "Close"],
          })
          .then((res) => {
            if (res.response === 0 && shell) {
              shell.openExternal("https://github.com/karangattu/seabird_nestcam_shiny_app/releases/latest");
            }
          });
      }
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    logger?.info?.(`Update not available. Current version is latest: v${info.version}`);
    if (isManualCheck) {
      isManualCheck = false;
      const win = getMainWindow?.();
      dialog.showMessageBox(win ?? null, {
        type: "info",
        title: "No Updates Available",
        message: "You are running the latest version.",
        detail: `Current version: v${app.getVersion()}`,
        buttons: ["OK"],
      });
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    logger?.info?.(`Download progress: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    isDownloading = false;
    logger?.info?.(`Update v${info.version} downloaded.`);
    const win = getMainWindow?.();
    const result = await dialog.showMessageBox(win ?? null, {
      type: "info",
      title: "Update Ready",
      message: `Version ${info.version} has been downloaded.`,
      detail: "The application will restart to complete the installation.",
      buttons: ["Restart and Install Now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      if (onBeforeQuitAndInstall) {
        await onBeforeQuitAndInstall();
      }
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on("error", (err) => {
    logger?.error?.(`Auto-updater error: ${err?.message ?? err}`);
    if (isManualCheck) {
      isManualCheck = false;
      const win = getMainWindow?.();
      dialog
        .showMessageBox(win ?? null, {
          type: "error",
          title: "Update Check Failed",
          message: "Could not check for updates.",
          detail: err?.message || String(err),
          buttons: ["View Releases on GitHub", "Close"],
        })
        .then((res) => {
          if (res.response === 0 && shell) {
            shell.openExternal("https://github.com/karangattu/seabird_nestcam_shiny_app/releases");
          }
        });
    }
  });

  function checkForUpdates({ manual = false } = {}) {
    if (isDownloading) {
      const win = getMainWindow?.();
      dialog.showMessageBox(win ?? null, {
        type: "info",
        title: "Update in Progress",
        message: "An update is currently downloading.",
        buttons: ["OK"],
      });
      return;
    }

    isManualCheck = manual;
    autoUpdater.checkForUpdates().catch((err) => {
      logger?.error?.(`Error in checkForUpdates: ${err?.message ?? err}`);
    });
  }

  return { checkForUpdates };
}

module.exports = { initAutoUpdater };
