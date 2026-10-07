import { createClient, SupabaseClient } from "@supabase/supabase-js";

let clientInstance: SupabaseClient | null = null;
let currentUrl = "";
let currentKey = "";

const defaultUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const defaultAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

function getClient(): SupabaseClient {
  if (!clientInstance) {
    currentUrl = defaultUrl || "https://placeholder.supabase.co";
    currentKey = defaultAnonKey || "placeholder-key";
    clientInstance = createClient(currentUrl, currentKey);
  }
  return clientInstance;
}

export function initDynamicSupabase(url: string, key: string) {
  const targetUrl = url ? url.trim() : "";
  const targetKey = key ? key.trim() : "";
  if (targetUrl && targetKey && (targetUrl !== currentUrl || targetKey !== currentKey)) {
    currentUrl = targetUrl;
    currentKey = targetKey;
    clientInstance = createClient(targetUrl, targetKey);
  }
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

