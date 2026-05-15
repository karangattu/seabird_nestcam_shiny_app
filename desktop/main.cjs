const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const { createSettingsHtml } = require("./settings-form.cjs");
const {
  buildServerEnvironment,
  findAvailablePort,
  getDesktopLogPath,
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
let serverLogPath;
const expectedServerStops = new WeakSet();
const recentServerLogLines = [];
const maxRecentServerLogLines = 80;

app.setName("Seabird NestCam Annotation");
registerSettingsIpc();

app.whenReady().then(async () => {
  serverLogPath = getDesktopLogPath(app.getPath("userData"));
  initializeServerLog();
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
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
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
        {
          label: "Restart Server",
          click: async () => {
            if (!currentDesktopSettings || !hasRequiredDesktopSettings(currentDesktopSettings)) {
              return;
            }

            stopServer();
            showStatusPage("Restarting local server", "Applying the desktop app settings.");
            await startServer();
          },
        },
        { type: "separator" },
        { label: "Open Server Log", click: () => openServerLog() },
        { label: "Open Logs Folder", click: () => openLogsFolder() },
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

    appendServerLog("desktop", `Starting server from ${serverEntry}`);
    appendServerLog("desktop", `Server URL: ${serverUrl}`);
    appendServerLog("desktop", `Platform: ${process.platform} ${process.arch}`);

    const child = spawn(process.execPath, [serverEntry], {
      cwd: serverDirectory,
      env: { ...childEnv, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess = child;
    child.stdout.on("data", (chunk) => appendServerLog("stdout", chunk));
    child.stderr.on("data", (chunk) => appendServerLog("stderr", chunk));
    child.once("error", (error) => appendServerLog("desktop", `Server process error: ${error.message}`));
    child.once("exit", (code, signal) => {
      const expectedStop = expectedServerStops.has(child);
      appendServerLog(
        "desktop",
        `Server process exited with code ${code ?? "null"} and signal ${signal ?? "null"}${expectedStop ? " after an app-requested stop" : ""}.`,
      );

      if (!expectedStop && mainWindow && !mainWindow.isDestroyed()) {
        showStatusPage(
          "Server stopped",
          "The local server stopped unexpectedly. Open the server log from the Server menu and send it to the project maintainer.",
          { details: getRecentServerLogText(), logPath: serverLogPath },
        );
      }

      if (serverProcess === child) {
        serverProcess = undefined;
      }
    });

    await waitForHttp(serverUrl, 30000);

    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(serverUrl);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendServerLog("desktop", `Could not start the app: ${message}`);
    showStatusPage("Could not start the app", message, {
      details: getRecentServerLogText(),
      logPath: serverLogPath,
    });
    await dialog.showMessageBox({
      type: "error",
      title: "Could not start the app",
      message,
      detail: `Server log: ${serverLogPath}\n\nRecent log lines:\n${getRecentServerLogText()}`,
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

  settingsWindow.webContents.on("context-menu", (event, params) => {
    const template = params.isEditable
      ? [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "pasteAndMatchStyle" },
          { role: "delete" },
          { type: "separator" },
          { role: "selectAll" },
        ]
      : [{ role: "copy" }, { role: "selectAll" }];

    Menu.buildFromTemplate(template).popup({ window: settingsWindow });
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
  expectedServerStops.add(processToStop);
  processToStop.kill();

  setTimeout(() => {
    if (!processToStop.killed) {
      processToStop.kill("SIGKILL");
    }
  }, 2000).unref();
}

function showStatusPage(title, message, { details = "", logPath = "" } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const logPathHtml = logPath
    ? `<p class="log-path"><strong>Server log:</strong> <code>${escapeHtml(logPath)}</code></p>`
    : "";
  const detailsHtml = details ? `<pre>${escapeHtml(details)}</pre>` : "";

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
      .log-path { margin-top: 14px; color: #374151; }
      code { word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
      pre { margin: 18px 0 0; max-height: 320px; overflow: auto; white-space: pre-wrap; border: 1px solid #d9dee5; border-radius: 6px; background: #f8fafc; padding: 12px; color: #111827; font-size: 12px; line-height: 1.45; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        ${logPathHtml}
        ${detailsHtml}
      </section>
    </main>
  </body>
</html>`;

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function initializeServerLog() {
  try {
    ensureServerLogFile();
    fs.appendFileSync(
      serverLogPath,
      `\n[${new Date().toISOString()}] [desktop] App session started.\n`,
      "utf8",
    );
  } catch (error) {
    console.error("Could not initialize server log", error);
  }
}

function ensureServerLogFile() {
  fs.mkdirSync(path.dirname(serverLogPath), { recursive: true });

  if (!fs.existsSync(serverLogPath)) {
    fs.writeFileSync(serverLogPath, "", "utf8");
  }
}

function appendServerLog(source, chunk) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const timestamp = new Date().toISOString();
  const formattedLines = lines
    .filter((line, index) => line.length > 0 || index < lines.length - 1)
    .map((line) => `[${timestamp}] [${source}] ${line}`);

  if (formattedLines.length === 0) {
    return;
  }

  for (const line of formattedLines) {
    recentServerLogLines.push(line);
  }

  while (recentServerLogLines.length > maxRecentServerLogLines) {
    recentServerLogLines.shift();
  }

  try {
    ensureServerLogFile();
    fs.appendFileSync(serverLogPath, `${formattedLines.join("\n")}\n`, "utf8");
  } catch (error) {
    console.error("Could not write server log", error);
  }

  const consoleMethod = source === "stderr" ? console.error : console.log;
  consoleMethod(`[server:${source}] ${text}`);
}

function getRecentServerLogText() {
  return recentServerLogLines.length > 0 ? recentServerLogLines.join("\n") : "No server output has been captured yet.";
}

async function openServerLog() {
  try {
    ensureServerLogFile();
    const errorMessage = await shell.openPath(serverLogPath);
    if (errorMessage) {
      throw new Error(errorMessage);
    }
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      title: "Could not open server log",
      message: error instanceof Error ? error.message : String(error),
      detail: serverLogPath,
    });
  }
}

async function openLogsFolder() {
  try {
    fs.mkdirSync(path.dirname(serverLogPath), { recursive: true });
    const errorMessage = await shell.openPath(path.dirname(serverLogPath));
    if (errorMessage) {
      throw new Error(errorMessage);
    }
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      title: "Could not open logs folder",
      message: error instanceof Error ? error.message : String(error),
      detail: path.dirname(serverLogPath),
    });
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (character) => {
    const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    return replacements[character];
  });
}
