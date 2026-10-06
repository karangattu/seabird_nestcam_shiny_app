import { describe, expect, test } from "vitest";
import { initDynamicSupabase, supabase } from "./supabase";

describe("supabase client initialization", () => {
  test("creates a client proxy and supports dynamic reinitialization", () => {
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe("function");

    initDynamicSupabase("https://custom-project.supabase.co", "custom-publishable-key");
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe("function");
  });

  test("ignores empty or invalid urls during dynamic initialization", () => {
    initDynamicSupabase("", "");
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe("function");
  });
});
