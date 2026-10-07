import { supabase } from "./supabase";

export const CHOICE_TABLES = ["cameras", "site_locations", "species", "behaviors", "team_members", "templates"] as const;

export function subscribeToDatabaseChanges(name: string, tables: readonly string[], onChange: () => void) {
  let active = true;
  const refresh = () => { if (active) onChange(); };
  const channel = supabase.channel(name);
  for (const table of tables) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
  }
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") refresh();
  });
  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}
