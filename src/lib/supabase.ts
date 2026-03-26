import { createClient } from "@supabase/supabase-js";

// Fall back to placeholder values so module evaluation at build time does not
// throw "supabaseUrl is required". The real values must be present at request
// time for any Supabase call to succeed.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://placeholder.invalid";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
