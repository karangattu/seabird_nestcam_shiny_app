import { supabase } from "@/lib/supabase";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

export interface AuditLogRecord {
  id: string;
  table_name: string;
  action: AuditAction;
  record_id?: string | null;
  user_name: string;
  old_data?: Record<string, any> | null;
  new_data?: Record<string, any> | null;
  summary: string;
  created_at: string;
}

export async function logAuditEvent(entry: {
  table_name: string;
  action: AuditAction;
  record_id?: string | null;
  user_name: string;
  old_data?: Record<string, any> | null;
  new_data?: Record<string, any> | null;
  summary: string;
}): Promise<void> {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      table_name: entry.table_name,
      action: entry.action,
      record_id: entry.record_id || null,
      user_name: entry.user_name || "Unknown",
      old_data: entry.old_data || null,
      new_data: entry.new_data || null,
      summary: entry.summary,
    });
    if (error) {
      console.warn("Audit log insert failed:", error.message);
    }
  } catch (err) {
    console.warn("Audit log exception:", err);
  }
}
