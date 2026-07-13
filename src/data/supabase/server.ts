/**
 * data/supabase/server — service-role client seam (forward-looking barrel)
 *
 * Phase-1 Wave-0 scaffold. RE-EXPORTS the existing service-role client so the
 * `data/` layer owns the canonical import path WITHOUT moving code in Wave 0
 * (spec §3.9, ratified decision #1). The original `src/lib/supabase-server.ts`
 * is unchanged and its current importers are untouched; later waves repoint
 * repositories at `@/data/supabase/server` instead.
 *
 * This client BYPASSES RLS (service role) — server-only, never the browser.
 * Only `data/**` may import a Supabase client (eslint boundary rule).
 */
export { supabaseServer } from "@/lib/supabase-server";
export { supabaseServer as supabaseServiceRole } from "@/lib/supabase-server";
