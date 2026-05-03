const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const { createSettingsHtml } = require("./settings-form.cjs");
const {
  buildServerEnvironment,
  findAvailablePort,
  getDesktopSettingsValidationMessage,
  getServerDirectory,
  hasRequiredDesktopSettings,
  loadDesktopSettings,
  readEnvFile,
  saveDesktopSettings,
  waitForHttp,
} = require("./runtime.cjs");

let mainWindow;
let serverProcess;
let serverUrl;
let currentDesktopSettings = {};
let activeSettingsModal;

app.setName("Seabird NestCam Annotation");
registerSettingsIpc();

app.whenReady().then(async () => {
  createWindow();
  createMenu();
  currentDesktopSettings = await ensureDesktopSettings();
  if (!currentDesktopSettings) {
    return;
  }
  await startServer();
});

app.on("before-quit", () => {
  stopServer();
});

app.on("window-all-closed", () => {
  app.quit();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    icon: getWindowIconPath(),
    show: false,
    title: "Seabird NestCam Annotation",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  showStatusPage("Starting local server", "The app is starting the bundled Next.js server.");
}

function getWindowIconPath() {
  const iconPath = path.join(__dirname, "..", "build", "icon.png");
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

function createMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { label: "Stop Server and Quit", click: () => app.quit() },
            ],
          },
        ]
      : []),
    {
      label: "Server",
      submenu: [
        {
          label: "Settings...",
          click: () => openSettingsForRestart(),
        },
        { type: "separator" },
        {
          label: "Open App",
          click: () => {
            if (serverUrl && mainWindow) {
              mainWindow.loadURL(serverUrl);
            }
          },
        },
        { type: "separator" },
        { label: "Stop Server and Quit", click: () => app.quit() },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { role: "resetZoom" }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function ensureDesktopSettings() {
  const savedSettings = loadDesktopSettings(app.getPath("userData"));

  if (hasRequiredDesktopSettings(savedSettings)) {
    return savedSettings;
  }

  showStatusPage(
    "Settings required",
    "Enter the Synology and Google Sheets settings to start the local app server.",
  );
  return openSettingsModal({ settings: savedSettings, canCancel: false });
}

async function openSettingsForRestart() {
  const nextSettings = await openSettingsModal({
    settings: currentDesktopSettings,
    canCancel: Boolean(currentDesktopSettings && hasRequiredDesktopSettings(currentDesktopSettings)),
  });

  if (!nextSettings) {
    return;
  }

  currentDesktopSettings = nextSettings;
  stopServer();
  showStatusPage("Restarting local server", "Applying the desktop app settings.");
  await startServer();
}

async function startServer() {
  try {
    const serverDirectory = getServerDirectory({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      cwd: process.cwd(),
    });
    const serverEntry = path.join(serverDirectory, "server.js");

    if (!fs.existsSync(serverEntry)) {
      throw new Error(`Could not find bundled server at ${serverEntry}`);
    }

    const port = await findAvailablePort(Number(process.env.SEABIRD_DESKTOP_PORT ?? 3210));
    serverUrl = `http://127.0.0.1:${port}`;

    const envValues = readEnvFile(path.join(serverDirectory, ".env"));
    const childEnv = buildServerEnvironment({
      baseEnv: process.env,
      envValues,
      desktopSettings: currentDesktopSettings,
      port,
    });

    serverProcess = spawn(process.execPath, [serverEntry], {
      cwd: serverDirectory,
      env: { ...childEnv, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess.stdout.on("data", (chunk) => console.log(`[server] ${chunk}`));
    serverProcess.stderr.on("data", (chunk) => console.error(`[server] ${chunk}`));
    serverProcess.once("exit", (code) => {
      if (code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
        showStatusPage("Server stopped", "The local server stopped unexpectedly.");
      }
      serverProcess = undefined;
    });

    await waitForHttp(serverUrl, 30000);

    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(serverUrl);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showStatusPage("Could not start the app", message);
    await dialog.showMessageBox({
      type: "error",
      title: "Could not start the app",
      message,
    });
  }
}

function openSettingsModal({ settings, canCancel }) {
  if (activeSettingsModal) {
    activeSettingsModal.window.focus();
    return activeSettingsModal.promise;
  }

  const settingsWindow = new BrowserWindow({
    width: 900,
    height: 840,
    minWidth: 720,
    minHeight: 620,
    parent: mainWindow,
    modal: Boolean(mainWindow),
    show: false,
    title: "App Settings",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "settings-preload.cjs"),
    },
  });

  let resolveModal;
  const promise = new Promise((resolve) => {
    resolveModal = resolve;
  });
  activeSettingsModal = { window: settingsWindow, canCancel, resolve: resolveModal, promise };

  settingsWindow.once("ready-to-show", () => {
    settingsWindow.show();
  });

  settingsWindow.on("closed", () => {
    if (activeSettingsModal?.window !== settingsWindow) {
      return;
    }

    const shouldQuit = !activeSettingsModal.canCancel;
    completeSettingsModal(null, { closeWindow: false });

    if (shouldQuit) {
      app.quit();
    }
  });

  const html = createSettingsHtml({ settings, canCancel });
  settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  return promise;
}

function registerSettingsIpc() {
  ipcMain.handle("desktop-settings:submit", async (event, payload) => {
    if (!activeSettingsModal || event.sender !== activeSettingsModal.window.webContents) {
      return { ok: false, message: "Settings window is not active." };
    }

    const settings = payload?.settings ?? {};
    const message = getDesktopSettingsValidationMessage(settings);
    if (message) {
      return { ok: false, message };
    }

    const nextSettings = payload?.saveSettings
      ? saveDesktopSettings(app.getPath("userData"), settings)
      : settings;

    setImmediate(() => completeSettingsModal(nextSettings));
    return { ok: true };
  });

  ipcMain.handle("desktop-settings:cancel", async (event) => {
    if (!activeSettingsModal || event.sender !== activeSettingsModal.window.webContents) {
      return { ok: false };
    }

    setImmediate(() => completeSettingsModal(null));
    return { ok: true };
  });
}

function completeSettingsModal(result, { closeWindow = true } = {}) {
  const modal = activeSettingsModal;
  if (!modal) {
    return;
  }

  activeSettingsModal = undefined;
  modal.resolve(result);

  if (closeWindow && !modal.window.isDestroyed()) {
    modal.window.close();
  }
}

function stopServer() {
  if (!serverProcess) {
    return;
  }

  const processToStop = serverProcess;
  serverProcess = undefined;
  processToStop.kill();

  setTimeout(() => {
    if (!processToStop.killed) {
      processToStop.kill("SIGKILL");
    }
  }, 2000).unref();
}

function showStatusPage(title, message) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7f8; color: #1f2933; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 32px; box-sizing: border-box; }
      section { max-width: 560px; background: white; border: 1px solid #d9dee5; border-radius: 8px; padding: 28px; box-shadow: 0 8px 28px rgba(15, 23, 42, 0.08); }
      h1 { margin: 0 0 12px; font-size: 22px; line-height: 1.2; }
      p { margin: 0; font-size: 15px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
      </section>
    </main>
  </body>
</html>`;

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (character) => {
    const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    return replacements[character];
  });
}
