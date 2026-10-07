import type { supabase } from "@/lib/supabase";

type Listener = { table: string; callback: (payload: any) => void };
const channels = new Set<{ listeners: Listener[]; status?: (status: string) => void }>();

export const realtime = {
  reset() { channels.clear(); },
  emit(table: string, payload: any = { eventType: "INSERT", new: {}, old: {} }) {
    for (const channel of channels) {
      for (const listener of channel.listeners) {
        if (listener.table === table) listener.callback(payload);
      }
    }
  },
  reconnect() {
    for (const channel of channels) channel.status?.("SUBSCRIBED");
  },
};

export function mockRealtime(client: typeof supabase) {
  return new Proxy(client, {
    get(target, key) {
      if (key === "channel") return () => {
        const channel = {
          listeners: [] as Listener[],
          status: undefined as ((status: string) => void) | undefined,
          on(_event: string, filter: { table: string }, callback: Listener["callback"]) {
            channel.listeners.push({ table: filter.table, callback });
            return channel;
          },
          subscribe(callback?: (status: string) => void) {
            channel.status = callback;
            channels.add(channel);
            return channel;
          },
        };
        return channel;
      };
      if (key === "removeChannel") return (channel: any) => { channels.delete(channel); };
      return Reflect.get(target, key);
    },
  });
}
