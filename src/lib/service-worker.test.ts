import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";

test("keeps database reads out of the offline cache", () => {
  const listeners: Record<string, (event: any) => void> = {};
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      location: { origin: "https://nestcam.example" },
      addEventListener: (name: string, callback: (event: any) => void) => { listeners[name] = callback; },
    },
    URL,
  });
  const respondWith = vi.fn();
  listeners.fetch({
    request: { method: "GET", url: "https://database.supabase.co/rest/v1/cameras", mode: "cors" },
    respondWith,
  });
  expect(respondWith).not.toHaveBeenCalled();
});
