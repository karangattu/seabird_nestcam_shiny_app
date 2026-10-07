import { supabase } from "./supabase";

export interface DbAnnotation {
  id: string;
  start_filename: string;
  end_filename: string;
  site: string;
  camera: string;
  retrieval_date: string;
  type: string;
  species: string;
  behavior: string;
  sequence_start_time?: string | null;
  sequence_end_time?: string | null;
  is_single_image: string;
  reviewer_name: string;
  notes?: string | null;
  created_at: string;
}
export type AnnotationCursor = Pick<DbAnnotation, "id" | "created_at">;
export type AnnotationFilters = { camera: string; site: string; type: string; date: string; search: string };
export const ANNOTATION_PAGE_SIZE = 50;
const SEARCH_COLUMNS = ["species", "behavior", "reviewer_name", "start_filename", "end_filename", "notes", "camera", "site"];

export async function fetchAnnotationPage(filters: AnnotationFilters, cursor: AnnotationCursor | null = null, size = ANNOTATION_PAGE_SIZE) {
  let query = supabase.from("annotations").select("*").order("created_at", {ascending:false}).order("id", {ascending:false}).limit(size + 1);
  if (filters.camera) query = query.eq("camera", filters.camera);
  if (filters.site) query = query.eq("site", filters.site);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.date) query = query.eq("retrieval_date", filters.date);
  const clauses: string[] = [];
  if (filters.search.trim()) {
    const pattern = JSON.stringify(`%${filters.search.trim().replace(/[\\%_]/g, "\\$&")}%`);
    clauses.push(`or(${SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(",")})`);
  }
  if (cursor) {
    const date = JSON.stringify(cursor.created_at), id = JSON.stringify(cursor.id);
    clauses.push(`or(created_at.lt.${date},and(created_at.eq.${date},id.lt.${id}))`);
  }
  if (clauses.length) query = query.or(`and(${clauses.join(",")})`);
  const {data, error} = await query;
  if (error) throw error;
  return { rows: (data ?? []).slice(0, size) as DbAnnotation[], hasNext: (data?.length ?? 0) > size };
}

export async function fetchReviewedMarkers() {
  const rows: Array<{id: string; start_filename: string; end_filename: string}> = [];
  let lastId: string | undefined;
  for (;;) {
    let query = supabase.from("annotations").select("id,start_filename,end_filename").order("id").limit(500);
    if (lastId) query = query.gt("id", lastId);
    const {data, error} = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
    lastId = data[data.length - 1].id;
  }
}
