import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const shellEnvKeys = new Set(Object.keys(process.env));

for (const envFile of [".env", ".env.local", ".env.desktop"]) {
  loadEnvFile(envFile);
}

const missing = ["SYNOLOGY_BASE_URL", "SYNOLOGY_USERNAME", "SYNOLOGY_PASSWORD"].filter(
  (key) => !process.env[key],
);

if (missing.length > 0) {
  fail(`Missing required Synology settings: ${missing.join(", ")}`);
}

const baseUrl = buildSynologyBaseUrl({
  baseUrl: process.env.SYNOLOGY_BASE_URL,
  port: process.env.SYNOLOGY_PORT,
});
const defaultFolder = process.env.SYNOLOGY_DEFAULT_FOLDER ?? "";

if (process.env.SYNOLOGY_VERIFY_SSL === "false") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

console.log(`Checking Synology connection at ${baseUrl}`);

let sid;

try {
  const auth = await synologyJsonRequest("/webapi/auth.cgi", {
    api: "SYNO.API.Auth",
    version: "6",
    method: "login",
    account: process.env.SYNOLOGY_USERNAME,
    passwd: process.env.SYNOLOGY_PASSWORD,
    session: "FileStation",
    format: "sid",
  });

  sid = auth.data?.sid;
  if (!sid) {
    fail("Synology login succeeded but did not return a session id.");
  }

  console.log("Authentication succeeded.");

  if (!defaultFolder) {
    console.log("Skipping File Station list check because SYNOLOGY_DEFAULT_FOLDER is empty.");
    process.exit(0);
  }

  const list = await synologyJsonRequest("/webapi/entry.cgi", {
    api: "SYNO.FileStation.List",
    version: "2",
    method: "list",
    folder_path: normalizeSynologyPath(defaultFolder),
    filetype: "file",
    additional: "size,time",
    limit: "5",
    _sid: sid,
  });

  const files = list.data?.files ?? [];
  console.log(`File Station list check succeeded for ${defaultFolder}.`);
  console.log(`Files visible in first page: ${files.length}`);
} catch (error) {
  fail(formatError(error));
} finally {
  if (sid) {
    try {
      await synologyJsonRequest("/webapi/auth.cgi", {
        api: "SYNO.API.Auth",
        version: "1",
        method: "logout",
        session: "FileStation",
        _sid: sid,
      });
    } catch {
      console.warn("Warning: could not log out the Synology session.");
    }
  }
}

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed || shellEnvKeys.has(parsed.key)) {
      continue;
    }
    process.env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value: value.replaceAll("\\n", "\n") };
}

function buildSynologyBaseUrl({ baseUrl = "", port }) {
  const normalizedBaseUrl = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  const url = new URL(normalizedBaseUrl);
  if (port && !url.port) {
    url.port = port;
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}

function normalizeSynologyPath(path) {
  return `/${path}`.replace(/\/+/g, "/").replace(/\/$/, "");
}

async function synologyJsonRequest(path, params) {
  const response = await fetch(`${baseUrl}${path}?${new URLSearchParams(params).toString()}`, {
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.text();
  const result = body ? JSON.parse(body) : {};

  if (!response.ok || !result.success) {
    throw new Error(`Synology API error: ${JSON.stringify(result.error ?? response.status)}`);
  }

  return result;
}

function formatError(error) {
  const details = getErrorDetails(error);

  if (details.code === "UND_ERR_CONNECT_TIMEOUT" || details.code === "ETIMEDOUT") {
    return "Could not connect before timing out. Confirm this computer is on the same LAN/VPN as the NAS and that SYNOLOGY_BASE_URL uses the working R script URL.";
  }

  if (details.code === "ECONNREFUSED") {
    return "Connection was refused. Check the NAS HTTP/HTTPS port and DSM firewall settings.";
  }

  if (
    details.code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    details.code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    details.message.includes("certificate")
  ) {
    return "TLS verification failed. For local LAN testing, use the HTTP NAS URL or set SYNOLOGY_VERIFY_SSL=false for a trusted network.";
  }

  return error instanceof Error ? error.message : String(error);
}

function getErrorDetails(error) {
  const messages = [];
  let code;
  let current = error;

  while (current && typeof current === "object") {
    if (typeof current.message === "string") {
      messages.push(current.message);
    }
    if (!code && typeof current.code === "string") {
      code = current.code;
    }
    current = current.cause;
  }

  return { code, message: messages.join(" ").toLowerCase() };
}

function fail(message) {
  console.error(`Synology check failed: ${message}`);
  process.exit(1);
}
