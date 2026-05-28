const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const desktopSettingsFileName = "desktop-settings.json";
const desktopLogFileName = "server.log";
const desktopSettingsKeys = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "GOOGLE_ASSIGNMENTS_SPREADSHEET_ID",
  "GOOGLE_ANNOTATIONS_SPREADSHEET_ID",
  "GOOGLE_ASSIGNMENTS_SHEET_NAME",
  "GOOGLE_ANNOTATIONS_SHEET_NAME",
  "SYNOLOGY_BASE_URL",
  "SYNOLOGY_PORT",
  "SYNOLOGY_USERNAME",
  "SYNOLOGY_PASSWORD",
  "SYNOLOGY_VERIFY_SSL",
  "SYNOLOGY_DEFAULT_FOLDER",
  "SYNOLOGY_ALLOWED_FOLDER_PREFIX",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

const requiredDesktopSettingsKeys = [
  "SYNOLOGY_BASE_URL",
  "SYNOLOGY_USERNAME",
  "SYNOLOGY_PASSWORD",
  "SYNOLOGY_DEFAULT_FOLDER",
];

function getServerDirectory({ isPackaged, resourcesPath, cwd }) {
  if (isPackaged) {
    return path.join(resourcesPath, "server");
  }

  return path.join(cwd, "desktop-runtime", "server");
}

function parseEnvContent(content) {
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value.replaceAll("\\n", "\n");
  }

  return values;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return parseEnvContent(fs.readFileSync(filePath, "utf8"));
}

function getDesktopSettingsPath(userDataPath) {
  return path.join(userDataPath, desktopSettingsFileName);
}

function getDesktopLogPath(userDataPath) {
  return path.join(userDataPath, desktopLogFileName);
}

function loadDesktopSettings(userDataPath) {
  const settingsPath = getDesktopSettingsPath(userDataPath);

  if (!fs.existsSync(settingsPath)) {
    return {};
  }

  try {
    return normalizeDesktopSettings(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    return {};
  }
}

function saveDesktopSettings(userDataPath, settings) {
  const normalizedSettings = normalizeDesktopSettings(settings);
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    getDesktopSettingsPath(userDataPath),
    `${JSON.stringify(normalizedSettings, null, 2)}\n`,
    "utf8",
  );
  return normalizedSettings;
}

function hasRequiredDesktopSettings(settings) {
  return !getDesktopSettingsValidationMessage(settings);
}

function getDesktopSettingsValidationMessage(settings) {
  const missing = [];

  for (const key of requiredDesktopSettingsKeys) {
    if (!hasSettingValue(settings, key)) {
      missing.push(key);
    }
  }

  const hasServiceAccountJson = hasSettingValue(settings, "GOOGLE_SERVICE_ACCOUNT_JSON");
  const hasSeparateGoogleCredentials =
    hasSettingValue(settings, "GOOGLE_SERVICE_ACCOUNT_EMAIL") &&
    hasSettingValue(settings, "GOOGLE_PRIVATE_KEY");

  if (!hasServiceAccountJson && !hasSeparateGoogleCredentials) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_EMAIL plus GOOGLE_PRIVATE_KEY");
  }

  const hasSharedSpreadsheet = hasSettingValue(settings, "GOOGLE_SHEETS_SPREADSHEET_ID");
  const hasSeparateSpreadsheets =
    hasSettingValue(settings, "GOOGLE_ASSIGNMENTS_SPREADSHEET_ID") &&
    hasSettingValue(settings, "GOOGLE_ANNOTATIONS_SPREADSHEET_ID");

  if (!hasSharedSpreadsheet && !hasSeparateSpreadsheets) {
    missing.push(
      "GOOGLE_SHEETS_SPREADSHEET_ID or GOOGLE_ASSIGNMENTS_SPREADSHEET_ID plus GOOGLE_ANNOTATIONS_SPREADSHEET_ID",
    );
  }

  return missing.length > 0 ? `Missing required settings: ${missing.join(", ")}.` : "";
}

function normalizeDesktopSettings(settings) {
  const normalizedSettings = {};

  if (!settings || typeof settings !== "object") {
    return normalizedSettings;
  }

  for (const key of desktopSettingsKeys) {
    if (!(key in settings)) {
      continue;
    }

    const value = settings[key];
    if (typeof value === "boolean") {
      normalizedSettings[key] = value ? "true" : "false";
    } else if (typeof value === "string") {
      normalizedSettings[key] = value;
    } else if (value != null) {
      normalizedSettings[key] = String(value);
    }
  }

  return normalizedSettings;
}

function hasSettingValue(settings, key) {
  return typeof settings?.[key] === "string" && settings[key].trim().length > 0;
}

function buildServerEnvironment({ baseEnv, envValues, desktopSettings = {}, port }) {
  return {
    ...baseEnv,
    ...envValues,
    ...normalizeDesktopSettings(desktopSettings),
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        findAvailablePort(startPort + 1).then(resolve, reject);
        return;
      }

      reject(error);
    });

    server.once("listening", () => {
      server.close(() => resolve(startPort));
    });

    server.listen(startPort, "127.0.0.1");
  });
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.status < 500) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

module.exports = {
  buildServerEnvironment,
  findAvailablePort,
  getServerDirectory,
  getDesktopSettingsValidationMessage,
  getDesktopLogPath,
  getDesktopSettingsPath,
  hasRequiredDesktopSettings,
  loadDesktopSettings,
  parseEnvContent,
  readEnvFile,
  saveDesktopSettings,
  waitForHttp,
};
