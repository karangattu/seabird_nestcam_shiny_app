import { beforeEach, describe, expect, test, vi } from "vitest";
import { logAuditEvent } from "./audit-logger";
import { supabase } from "./supabase";

vi.mock("./supabase", () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

describe("audit-logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("inserts audit log event with expected payload", async () => {
    let insertedPayload: any = null;
    vi.mocked(supabase.from).mockReturnValue({
      insert: vi.fn().mockImplementation((payload) => {
        insertedPayload = payload;
        return Promise.resolve({ error: null });
      }),
    } as any);

    await logAuditEvent({
      table_name: "cameras",
      action: "CREATE",
      record_id: "CAM-01",
      user_name: "Alice",
      summary: 'Added Camera "CAM-01"',
      new_data: { name: "CAM-01" },
    });

    expect(insertedPayload).toEqual({
      table_name: "cameras",
      action: "CREATE",
      record_id: "CAM-01",
      user_name: "Alice",
      old_data: null,
      new_data: { name: "CAM-01" },
      summary: 'Added Camera "CAM-01"',
    });
  });

  test("falls back to Unknown user if user_name is omitted or empty", async () => {
    let insertedPayload: any = null;
    vi.mocked(supabase.from).mockReturnValue({
      insert: vi.fn().mockImplementation((payload) => {
        insertedPayload = payload;
        return Promise.resolve({ error: null });
      }),
    } as any);

    await logAuditEvent({
      table_name: "species",
      action: "DELETE",
      user_name: "",
      summary: 'Deleted Species "Shearwater"',
    });

    expect(insertedPayload?.user_name).toBe("Unknown");
    expect(insertedPayload?.record_id).toBeNull();
  });

  test("handles insertion errors gracefully without throwing", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      insert: vi.fn().mockRejectedValue(new Error("Network failure")),
    } as any);

    await expect(
      logAuditEvent({
        table_name: "behaviors",
        action: "UPDATE",
        user_name: "Bob",
        summary: "Updated behavior",
      })
    ).resolves.toBeUndefined();
  });
});
