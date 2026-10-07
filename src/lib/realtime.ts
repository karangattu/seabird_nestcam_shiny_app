import { supabase } from "./supabase";

export const CHOICE_TABLES = ["cameras", "site_locations", "species", "behaviors", "team_members", "templates"] as const;

export function subscribeToDatabaseChanges(name: string, tables: readonly string[], onChange: (tables: readonly string[]) => void) {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Set<string>();
  const schedule = (changed: readonly string[]) => {
    if (!active) return;
    changed.forEach((table) => pending.add(table));
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      const changedTables = [...pending];
      pending.clear();
      if (active) onChange(changedTables);
    }, 100);
  };
  const channel = supabase.channel(name);
  for (const table of tables) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => schedule([table]));
  }
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") schedule(tables);
  });
  return () => {
    active = false;
    clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}
