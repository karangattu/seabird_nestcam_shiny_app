import { createSign } from "node:crypto";
import { ANNOTATION_COLUMNS, type AnnotationRecord } from "@/lib/annotation-data";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

type SheetKind = "assignments" | "annotations";

type SheetConfig = {
  clientEmail: string;
  privateKey: string;
  assignmentsSpreadsheetId: string;
  annotationsSpreadsheetId: string;
  assignmentsSheetName: string;
  annotationsSheetName: string;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

export type GoogleSheetsStatus = {
  configured: boolean;
  missing: string[];
  assignmentsSheetName: string;
  annotationsSheetName: string;
};

export type SheetRows = {
  headers: string[];
  rows: Record<string, string>[];
};

export class SheetConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetConfigError";
  }
}

let tokenCache: TokenCache | null = null;

function parseServiceAccountJson() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) {
    return null;
  }

  try {
    const serviceAccount = JSON.parse(rawJson) as {
      client_email?: string;
      private_key?: string;
    };
    return {
      clientEmail: serviceAccount.client_email ?? "",
      privateKey: serviceAccount.private_key ?? "",
    };
  } catch {
    throw new SheetConfigError("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
}

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, "\n").trim();
}

export function getGoogleSheetsStatus(
  env: Record<string, string | undefined> = process.env,
): GoogleSheetsStatus {
  const hasServiceAccountJson = Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const hasSeparateEmail = Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const hasSeparatePrivateKey = Boolean(env.GOOGLE_PRIVATE_KEY);
  const hasSharedSpreadsheet = Boolean(env.GOOGLE_SHEETS_SPREADSHEET_ID);
  const hasSeparateSpreadsheets = Boolean(
    env.GOOGLE_ASSIGNMENTS_SPREADSHEET_ID && env.GOOGLE_ANNOTATIONS_SPREADSHEET_ID,
  );
  const missing: string[] = [];

  if (!hasServiceAccountJson && !hasSeparateEmail) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_JSON");
  }
  if (!hasServiceAccountJson && !hasSeparatePrivateKey) {
    missing.push("GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_JSON");
  }
  if (!hasSharedSpreadsheet && !hasSeparateSpreadsheets) {
    missing.push(
      "GOOGLE_SHEETS_SPREADSHEET_ID or GOOGLE_ASSIGNMENTS_SPREADSHEET_ID plus GOOGLE_ANNOTATIONS_SPREADSHEET_ID",
    );
  }

  return {
    configured: missing.length === 0,
    missing,
    assignmentsSheetName: env.GOOGLE_ASSIGNMENTS_SHEET_NAME ?? "Sheet1",
    annotationsSheetName: env.GOOGLE_ANNOTATIONS_SHEET_NAME ?? "Sheet1",
  };
}

function getSheetConfig(): SheetConfig {
  const fromJson = parseServiceAccountJson();
  const clientEmail =
    fromJson?.clientEmail ?? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "";
  const privateKey = normalizePrivateKey(
    fromJson?.privateKey ?? process.env.GOOGLE_PRIVATE_KEY ?? "",
  );
  const fallbackSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "";
  const assignmentsSpreadsheetId =
    process.env.GOOGLE_ASSIGNMENTS_SPREADSHEET_ID ?? fallbackSpreadsheetId;
  const annotationsSpreadsheetId =
    process.env.GOOGLE_ANNOTATIONS_SPREADSHEET_ID ?? fallbackSpreadsheetId;

  if (!clientEmail || !privateKey) {
    throw new SheetConfigError(
      "Google Sheets credentials are not configured for the Next.js server.",
    );
  }
  if (!assignmentsSpreadsheetId && !annotationsSpreadsheetId) {
    throw new SheetConfigError(
      "Set GOOGLE_ASSIGNMENTS_SPREADSHEET_ID and GOOGLE_ANNOTATIONS_SPREADSHEET_ID, or set GOOGLE_SHEETS_SPREADSHEET_ID for both.",
    );
  }

  return {
    clientEmail,
    privateKey,
    assignmentsSpreadsheetId,
    annotationsSpreadsheetId,
    assignmentsSheetName: process.env.GOOGLE_ASSIGNMENTS_SHEET_NAME ?? "Sheet1",
    annotationsSheetName: process.env.GOOGLE_ANNOTATIONS_SHEET_NAME ?? "Sheet1",
  };
}

function base64UrlEncode(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(config: SheetConfig) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: config.clientEmail,
      scope: SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      exp: issuedAt + 3600,
      iat: issuedAt,
    }),
  );
  const unsignedToken = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(unsignedToken)
    .sign(config.privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${unsignedToken}.${signature}`;
}

async function getAccessToken(config: SheetConfig) {
  if (tokenCache && tokenCache.expiresAt - 60_000 > Date.now()) {
    return tokenCache.accessToken;
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signJwt(config),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google auth failed: ${errorText}`);
  }

  const tokenResponse = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    accessToken: tokenResponse.access_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  };

  return tokenCache.accessToken;
}

function sheetRange(sheetName: string, range: string) {
  const escapedSheetName = sheetName.replace(/'/g, "''");
  return `'${escapedSheetName}'!${range}`;
}

function getSheetTarget(config: SheetConfig, kind: SheetKind) {
  if (kind === "assignments") {
    if (!config.assignmentsSpreadsheetId) {
      throw new SheetConfigError("GOOGLE_ASSIGNMENTS_SPREADSHEET_ID is missing.");
    }
    return {
      spreadsheetId: config.assignmentsSpreadsheetId,
      sheetName: config.assignmentsSheetName,
    };
  }

  if (!config.annotationsSpreadsheetId) {
    throw new SheetConfigError("GOOGLE_ANNOTATIONS_SPREADSHEET_ID is missing.");
  }
  return {
    spreadsheetId: config.annotationsSpreadsheetId,
    sheetName: config.annotationsSheetName,
  };
}

async function sheetsRequest<T>(
  config: SheetConfig,
  spreadsheetId: string,
  path: string,
  init: RequestInit = {},
) {
  const accessToken = await getAccessToken(config);
  const response = await fetch(`${GOOGLE_SHEETS_BASE_URL}/${spreadsheetId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets request failed: ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function readSheetRows(kind: SheetKind): Promise<SheetRows> {
  const config = getSheetConfig();
  const target = getSheetTarget(config, kind);
  const range = encodeURIComponent(sheetRange(target.sheetName, "A:ZZ"));
  const response = await sheetsRequest<{ values?: string[][] }>(
    config,
    target.spreadsheetId,
    `/values/${range}`,
  );
  const values = response.values ?? [];
  const headers = values[0] ?? [];

  return {
    headers,
    rows: values.slice(1).map((rowValues) =>
      Object.fromEntries(
        headers.map((header, headerIndex) => [
          header,
          rowValues[headerIndex] ?? "",
        ]),
      ),
    ),
  };
}

function toCellValue(value: string | undefined) {
  return value ?? "";
}

export async function appendAnnotationRows(records: AnnotationRecord[]) {
  const config = getSheetConfig();
  const target = getSheetTarget(config, "annotations");
  const currentRows = await readSheetRows("annotations");
  const headers = currentRows.headers.length
    ? currentRows.headers
    : [...ANNOTATION_COLUMNS];

  if (!currentRows.headers.length) {
    const headerRange = encodeURIComponent(sheetRange(target.sheetName, "A1:M1"));
    await sheetsRequest(
      config,
      target.spreadsheetId,
      `/values/${headerRange}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({ values: [ANNOTATION_COLUMNS] }),
      },
    );
  }

  const values = records.map((record) =>
    headers.map((header) => toCellValue(record[header as keyof AnnotationRecord])),
  );
  const appendRange = encodeURIComponent(sheetRange(target.sheetName, "A:M"));

  return sheetsRequest<{ updates?: { updatedRows?: number } }>(
    config,
    target.spreadsheetId,
    `/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    },
  );
}

export function isSheetConfigError(error: unknown): error is SheetConfigError {
  return error instanceof SheetConfigError;
}
