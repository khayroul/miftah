import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://placeholder.invalid";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-key";

/** Service-role client. It bypasses RLS and must remain server-only. */
export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export const supabaseServiceRole = supabaseServer;
