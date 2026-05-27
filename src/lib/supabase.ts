import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xvwuxydieiywxnnnnvxg.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_tR-i0FQQv2_8L7yk6gKUbQ_Ew0Tqk5M";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
