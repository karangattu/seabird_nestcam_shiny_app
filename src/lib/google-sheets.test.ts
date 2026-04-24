import { describe, expect, test } from "vitest";
import { getGoogleSheetsStatus } from "./google-sheets";

describe("getGoogleSheetsStatus", () => {
  test("reports missing server credentials without exposing secrets", () => {
    const status = getGoogleSheetsStatus({});

    expect(status.configured).toBe(false);
    expect(status.missing).toContain("GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_JSON");
    expect(status.missing).toContain("GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_JSON");
    expect(JSON.stringify(status)).not.toContain("PRIVATE KEY");
  });

  test("accepts one spreadsheet id shared by assignments and annotations", () => {
    const status = getGoogleSheetsStatus({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: "private-key-placeholder",
      GOOGLE_SHEETS_SPREADSHEET_ID: "sheet-id",
    });

    expect(status).toEqual({
      configured: true,
      missing: [],
      assignmentsSheetName: "Sheet1",
      annotationsSheetName: "Sheet1",
    });
  });
});
