/**
 * data/supabase/browser — anon browser client seam (forward-looking barrel)
 *
 * Phase-1 Wave-0 scaffold. RE-EXPORTS the existing anon client. Kept (not
 * deleted) per ratified decision #1 / §8(1): the browser anon client has ZERO
 * consumers today (all DB access is server-side via the service-role client),
 * but Phase-2 client-side RLS reads will need it — deleting then re-adding
 * would churn the seam.
 *
 * The original `src/lib/supabase.ts` is unchanged. Only `data/**` may import a
 * Supabase client (eslint boundary rule).
 */
export { supabase } from "@/lib/supabase";
export { supabase as supabaseBrowser } from "@/lib/supabase";
