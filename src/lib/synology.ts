import { posix } from "node:path";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export type SynologyStatus = {
  configured: boolean;
  missing: string[];
  defaultFolder: string;
};

export type SynologyImage = {
  name: string;
  path: string;
  size: number;
  captureTime: string;
  url: string;
};

type SynologyConfig = {
  baseUrl: string;
  username: string;
  password: string;
  verifySsl: boolean;
  defaultFolder: string;
  allowedFolderPrefix: string;
};

type SynologyBaseInput = {
  baseUrl?: string;
  port?: string;
};

type SynologyListResponse = {
  success?: boolean;
  data?: {
    files?: Array<{
      name?: string;
      path?: string;
      isdir?: boolean;
      additional?: {
        real_path?: string;
        size?: number;
        time?: {
          mtime?: number;
        };
      };
    }>;
  };
  error?: unknown;
};

type SynologyAuthResponse = {
  success?: boolean;
  data?: {
    sid?: string;
  };
  error?: unknown;
};

export class SynologyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SynologyConfigError";
  }
}

export function buildSynologyBaseUrl({ baseUrl = "", port }: SynologyBaseInput) {
  if (!baseUrl) {
    return "";
  }

  const normalizedBaseUrl = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  const url = new URL(normalizedBaseUrl);
  if (port && !url.port) {
    url.port = port;
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}

export function getSynologyStatus(
  env: Record<string, string | undefined> = process.env,
): SynologyStatus {
  const missing: string[] = [];
  if (!env.SYNOLOGY_BASE_URL) {
    missing.push("SYNOLOGY_BASE_URL");
  }
  if (!env.SYNOLOGY_USERNAME) {
    missing.push("SYNOLOGY_USERNAME");
  }
  if (!env.SYNOLOGY_PASSWORD) {
    missing.push("SYNOLOGY_PASSWORD");
  }

  return {
    configured: missing.length === 0,
    missing,
    defaultFolder: env.SYNOLOGY_DEFAULT_FOLDER ?? "",
  };
}

export function isAllowedSynologyPath(path: string, allowedFolderPrefix: string) {
  if (!allowedFolderPrefix) {
    return true;
  }

  const normalizedPath = normalizeSynologyPath(path);
  const normalizedPrefix = normalizeSynologyPath(allowedFolderPrefix);
  return normalizedPrefix === "/" || normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

export function isSynologyConfigError(error: unknown): error is SynologyConfigError {
  return error instanceof SynologyConfigError;
}

export function getSynologyUserMessage(error: unknown) {
  const details = getErrorDetails(error);

  if (details.code === "UND_ERR_CONNECT_TIMEOUT" || details.code === "ETIMEDOUT") {
    return "The app could not connect to the Synology NAS before timing out. If this is a local LAN setup, make sure this computer is on the same network as the NAS and that SYNOLOGY_BASE_URL/SYNOLOGY_PORT match the working R script URL.";
  }

  if (details.code === "ECONNREFUSED") {
    return "The Synology NAS refused the connection. Check that the DSM/File Station HTTP or HTTPS port is correct and open from this computer.";
  }

  if (
    details.code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    details.code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    details.message.includes("certificate")
  ) {
    return "The app reached the Synology NAS, but TLS certificate verification failed. Use the NAS HTTP URL for local LAN testing or set SYNOLOGY_VERIFY_SSL=false only for a trusted local network.";
  }

  return "Could not load images from Synology.";
}

function normalizeSynologyPath(path: string) {
  return posix.normalize(`/${path}`).replace(/\/$/, "") || "/";
}

function getErrorDetails(error: unknown): { code?: string; message: string } {
  const messages: string[] = [];
  let code: string | undefined;
  let current: unknown = error;

  while (current && typeof current === "object") {
    if ("message" in current && typeof current.message === "string") {
      messages.push(current.message);
    }
    if (!code && "code" in current && typeof current.code === "string") {
      code = current.code;
    }
    current = "cause" in current ? current.cause : undefined;
  }

  return { code, message: messages.join(" ").toLowerCase() };
}

function getSynologyConfig(): SynologyConfig {
  const status = getSynologyStatus();
  if (!status.configured) {
    throw new SynologyConfigError(`Missing Synology settings: ${status.missing.join(", ")}`);
  }

  const baseUrl = buildSynologyBaseUrl({
    baseUrl: process.env.SYNOLOGY_BASE_URL,
    port: process.env.SYNOLOGY_PORT,
  });
  const defaultFolder = process.env.SYNOLOGY_DEFAULT_FOLDER ?? "";

  return {
    baseUrl,
    username: process.env.SYNOLOGY_USERNAME ?? "",
    password: process.env.SYNOLOGY_PASSWORD ?? "",
    verifySsl: process.env.SYNOLOGY_VERIFY_SSL !== "false",
    defaultFolder,
    allowedFolderPrefix: process.env.SYNOLOGY_ALLOWED_FOLDER_PREFIX ?? defaultFolder,
  };
}

function maybeAllowInsecureTls(config: SynologyConfig) {
  if (!config.verifySsl) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
}

async function synologyJsonRequest<T>(config: SynologyConfig, path: string, params: URLSearchParams) {
  maybeAllowInsecureTls(config);
  const response = await fetch(`${config.baseUrl}${path}?${params.toString()}`, {
    cache: "no-store",
  });
  const result = (await response.json()) as T & { success?: boolean; error?: unknown };

  if (!response.ok || !result.success) {
    throw new Error(`Synology request failed: ${JSON.stringify(result.error ?? response.status)}`);
  }

  return result;
}

async function getSynologySid(config: SynologyConfig) {
  const params = new URLSearchParams({
    api: "SYNO.API.Auth",
    version: "6",
    method: "login",
    account: config.username,
    passwd: config.password,
    session: "FileStation",
    format: "sid",
  });
  const result = await synologyJsonRequest<SynologyAuthResponse>(config, "/webapi/auth.cgi", params);
  const sid = result.data?.sid;
  if (!sid) {
    throw new Error("Synology login succeeded but no session id was returned.");
  }
  return sid;
}

function isImageName(name: string) {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension);
}

function formatSynologyTime(seconds?: number) {
  if (!seconds) {
    return "";
  }
  return new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19);
}

export type SynologyFolderListing = {
  folder: string;
  parentFolder: string | null;
  folders: Array<{ name: string; path: string }>;
};

type SynologyEntry = NonNullable<NonNullable<SynologyListResponse["data"]>["files"]>[number];

async function listSynologyShares(config: SynologyConfig, sid: string) {
  const result = await synologyJsonRequest<{ data?: { shares?: SynologyEntry[] } }>(config, "/webapi/entry.cgi", new URLSearchParams({
    api: "SYNO.FileStation.List",
    version: "2",
    method: "list_share",
    additional: "real_path",
    _sid: sid,
  }));
  return result.data?.shares ?? [];
}

async function resolveFileStationPath(path: string, config: SynologyConfig, sid: string) {
  if (!/^\/volume\d+(?:\/|$)/.test(path)) {
    return { apiPath: path, toLocalPath: (value: string) => normalizeSynologyPath(value) };
  }
  const shares = await listSynologyShares(config, sid);
  const share = shares.find((entry) => entry.path && entry.additional?.real_path &&
    isAllowedSynologyPath(path, entry.additional.real_path));
  if (!share?.path || !share.additional?.real_path) {
    throw new SynologyConfigError("The NAS account cannot access this shared folder.");
  }
  const apiPrefix = normalizeSynologyPath(share.path);
  const realPrefix = normalizeSynologyPath(share.additional.real_path);
  return {
    apiPath: apiPrefix + path.slice(realPrefix.length),
    toLocalPath: (value: string) => {
      const normalized = normalizeSynologyPath(value);
      return isAllowedSynologyPath(normalized, apiPrefix)
        ? realPrefix + normalized.slice(apiPrefix.length)
        : normalized;
    },
  };
}

export async function listSynologyFolders(folderPath: string): Promise<SynologyFolderListing> {
  const config = getSynologyConfig();
  const folder = normalizeSynologyPath(folderPath || config.defaultFolder || config.allowedFolderPrefix || "/");
  if (!isAllowedSynologyPath(folder, config.allowedFolderPrefix)) {
    throw new SynologyConfigError("Requested Synology folder is outside the allowed folder prefix.");
  }
  const parent = posix.dirname(folder);
  const parentFolder = folder !== parent && isAllowedSynologyPath(parent, config.allowedFolderPrefix) ? parent : null;
  const sid = await getSynologySid(config);
  let entries: SynologyEntry[];
  let toLocalPath: (path: string) => string;
  if (folder === "/" || /^\/volume\d+$/.test(folder)) {
    entries = await listSynologyShares(config, sid);
    toLocalPath = (path) => normalizeSynologyPath(path);
  } else {
    const resolved = await resolveFileStationPath(folder, config, sid);
    toLocalPath = resolved.toLocalPath;
    const result = await synologyJsonRequest<SynologyListResponse>(config, "/webapi/entry.cgi", new URLSearchParams({
      api: "SYNO.FileStation.List",
      version: "2",
      method: "list",
      folder_path: resolved.apiPath,
      filetype: "dir",
      additional: "real_path",
      sort_by: "name",
      sort_direction: "asc",
      _sid: sid,
    }));
    entries = result.data?.files ?? [];
  }
  const folders = entries
    .filter((entry) => entry.isdir && entry.name && entry.path)
    .map((entry) => ({name: entry.name!, path: toLocalPath(folder.startsWith("/volume") ? entry.additional?.real_path || entry.path! : entry.path!)}))
    .filter((entry) => posix.dirname(entry.path) === folder && isAllowedSynologyPath(entry.path, config.allowedFolderPrefix))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {folder, parentFolder, folders};
}

export async function listSynologyImages(folderPath: string, limit = 300): Promise<SynologyImage[]> {
  const config = getSynologyConfig();
  const folder = normalizeSynologyPath(folderPath || config.defaultFolder);
  if (!isAllowedSynologyPath(folder, config.allowedFolderPrefix)) {
    throw new SynologyConfigError("Requested Synology folder is outside the allowed folder prefix.");
  }

  const sid = await getSynologySid(config);
  const resolved = await resolveFileStationPath(folder, config, sid);
  const params = new URLSearchParams({
    api: "SYNO.FileStation.List",
    version: "2",
    method: "list",
    folder_path: resolved.apiPath,
    filetype: "file",
    additional: "size,time",
    sort_by: "name",
    sort_direction: "asc",
    _sid: sid,
  });
  const result = await synologyJsonRequest<SynologyListResponse>(config, "/webapi/entry.cgi", params);
  const files = result.data?.files ?? [];

  return files
    .filter((file) => file.name && file.path && isImageName(file.name) && isAllowedSynologyPath(resolved.toLocalPath(file.path), config.allowedFolderPrefix))
    .slice(0, Math.max(1, Math.min(limit, 2000)))
    .map((file) => ({
      name: file.name ?? "image",
      path: resolved.toLocalPath(file.path ?? ""),
      size: file.additional?.size ?? 0,
      captureTime: formatSynologyTime(file.additional?.time?.mtime),
      url: `/api/synology/image?path=${encodeURIComponent(resolved.toLocalPath(file.path ?? ""))}`,
    }));
}

export async function downloadSynologyImage(path: string) {
  const config = getSynologyConfig();
  const normalizedPath = normalizeSynologyPath(path);
  if (!isAllowedSynologyPath(normalizedPath, config.allowedFolderPrefix)) {
    throw new SynologyConfigError("Requested Synology image is outside the allowed folder prefix.");
  }

  const sid = await getSynologySid(config);
  const resolved = await resolveFileStationPath(normalizedPath, config, sid);
  const params = new URLSearchParams({
    api: "SYNO.FileStation.Download",
    version: "2",
    method: "download",
    path: JSON.stringify([resolved.apiPath]),
    mode: "open",
    _sid: sid,
  });
  maybeAllowInsecureTls(config);
  const response = await fetch(`${config.baseUrl}/webapi/entry.cgi?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok || !response.body) {
    throw new Error(`Synology image download failed: ${response.status}`);
  }

  return response;
}
