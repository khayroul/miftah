import { createClient } from "@supabase/supabase-js";

// Placeholder values keep build-time module evaluation safe. Real values are
// still required before a repository makes a request.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://placeholder.invalid";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseBrowser = supabase;
