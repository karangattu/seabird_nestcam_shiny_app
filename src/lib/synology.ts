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
      additional?: {
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
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

export function isSynologyConfigError(error: unknown): error is SynologyConfigError {
  return error instanceof SynologyConfigError;
}

function normalizeSynologyPath(path: string) {
  return `/${path}`.replace(/\/+/g, "/").replace(/\/$/, "");
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

export async function listSynologyImages(folderPath: string, limit = 300): Promise<SynologyImage[]> {
  const config = getSynologyConfig();
  const folder = normalizeSynologyPath(folderPath || config.defaultFolder);
  if (!isAllowedSynologyPath(folder, config.allowedFolderPrefix)) {
    throw new SynologyConfigError("Requested Synology folder is outside the allowed folder prefix.");
  }

  const sid = await getSynologySid(config);
  const params = new URLSearchParams({
    api: "SYNO.FileStation.List",
    version: "2",
    method: "list",
    folder_path: folder,
    filetype: "file",
    additional: "size,time",
    sort_by: "name",
    sort_direction: "asc",
    _sid: sid,
  });
  const result = await synologyJsonRequest<SynologyListResponse>(config, "/webapi/entry.cgi", params);
  const files = result.data?.files ?? [];

  return files
    .filter((file) => file.name && file.path && isImageName(file.name))
    .slice(0, Math.max(1, Math.min(limit, 2000)))
    .map((file) => ({
      name: file.name ?? "image",
      path: file.path ?? "",
      size: file.additional?.size ?? 0,
      captureTime: formatSynologyTime(file.additional?.time?.mtime),
      url: `/api/synology/image?path=${encodeURIComponent(file.path ?? "")}`,
    }));
}

export async function downloadSynologyImage(path: string) {
  const config = getSynologyConfig();
  const normalizedPath = normalizeSynologyPath(path);
  if (!isAllowedSynologyPath(normalizedPath, config.allowedFolderPrefix)) {
    throw new SynologyConfigError("Requested Synology image is outside the allowed folder prefix.");
  }

  const sid = await getSynologySid(config);
  const params = new URLSearchParams({
    api: "SYNO.FileStation.Download",
    version: "2",
    method: "download",
    path: JSON.stringify([normalizedPath]),
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
