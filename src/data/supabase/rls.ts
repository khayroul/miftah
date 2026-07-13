/**
 * data/supabase/rls — session-scoped RLS client factory (Phase-2 wire-in SEAM)
 *
 * Phase-1 Wave-0 scaffold. NEW, INTENTIONALLY UNUSED seam (ratified decision
 * #1 / §8(2)): every read today uses the service-role client (RLS OFF,
 * single-user). Phase-2 auth+license converts reads to a session-scoped client
 * that runs WITH RLS. Introducing the factory now (~1 file) unblocks Phase 2
 * cleanly; WIRING it is Phase 2 — do NOT add callers in Phase 1.
 *
 * Approach: a thin factory over the anon key with the caller's access token in
 * the Authorization header, so Postgres RLS evaluates `auth.uid()` for that
 * user. No cookie/session plumbing here — the caller (Phase-2 `features/auth`)
 * supplies the token it already holds. Only `data/**` may touch a client.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://placeholder.invalid";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-key";

/**
 * Create a Supabase client scoped to a user session (RLS ON).
 *
 * PHASE-2 WIRE-IN — unused in Phase 1. Pass the user's Supabase access token;
 * the returned client runs every query as that user, so Row Level Security
 * policies apply (unlike the service-role client, which bypasses them).
 *
 * @param accessToken - the user's Supabase JWT access token.
 * @returns a session-scoped {@link SupabaseClient} (RLS enforced).
 */
export function createRlsClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
