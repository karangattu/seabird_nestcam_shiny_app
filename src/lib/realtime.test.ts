import { act } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { realtime } from "@/test/realtime";
import { subscribeToDatabaseChanges } from "./realtime";
vi.mock("./supabase", async (original) => {
  const client = await original<typeof import("./supabase")>();
  const { mockRealtime } = await import("@/test/realtime");
  return { ...client, supabase: mockRealtime(client.supabase) };
});
test("combines bursts into one reload per changed table and cancels pending work on cleanup", async () => {
  realtime.reset();
  vi.useFakeTimers();
  try {
    const refresh = vi.fn();
    const stop = subscribeToDatabaseChanges("test", ["cameras", "audit_logs"], refresh);
    act(() => { for (let i = 0; i < 100; i++) realtime.emit("cameras"); realtime.emit("audit_logs"); });
    await vi.advanceTimersByTimeAsync(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(new Set(refresh.mock.calls[0][0])).toEqual(new Set(["cameras", "audit_logs"]));
    realtime.emit("cameras");
    stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(refresh).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
