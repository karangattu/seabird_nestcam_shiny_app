import { supabase } from "./supabase";
import type { DynamicChoices, ObservationType } from "./annotation-data";

const fields = {
  cameras: {key:"cameras", columns:"name", order:"name"},
  site_locations: {key:"locations", columns:"name", order:"name"},
  species: {key:"species", columns:"name, type", order:"name"},
  behaviors: {key:"behaviors", columns:"name, type", order:"name"},
  team_members: {key:"teamMembers", columns:"name", order:"name"},
  templates: {key:"templates", columns:"id, label, type, species, behavior", order:"label"},
} as const;
export type ChoiceTable = keyof typeof fields;
export async function fetchChoiceTable(table: ChoiceTable): Promise<Partial<DynamicChoices>> {
  const field = fields[table];
  const {data, error} = await supabase.from(table).select(field.columns).order(field.order);
  if (error) throw error;
  if (!data) return {};
  const values = data.map((row: any) => table === "templates" ? {...row, type: row.type as ObservationType}
    : table === "species" || table === "behaviors" ? {name:row.name, type:row.type as ObservationType} : row.name);
  return {[field.key]: values};
}
