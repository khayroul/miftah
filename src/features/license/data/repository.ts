/**
 * features/license/data/repository — TYPED STUB (Phase-2 wire-in)
 *
 * Phase-1 Wave-0 scaffold. Defines the license repository CONTRACT only. No
 * implementation, no Supabase access, no behavior. Phase-2 Lane B implements
 * these against a session-scoped RLS client via `@/data/supabase/rls` and a
 * `@/data/repositories/license` repository (parent spec §Phase-2 Lane B).
 *
 * The types + not-yet-implemented functions exist NOW so the Phase-2 module
 * lands against a named seam (spec §3.8). Do NOT wire callers in Phase 1.
 */

/** A single license grant for the operator/user (Phase-2 shape — provisional). */
export interface LicenseRecord {
  readonly id: string;
  readonly userId: string;
  /** e.g. "free" | "premium" — finalized in Phase 2. */
  readonly tier: string;
  readonly status: "active" | "expired" | "revoked";
  /** ISO-8601 timestamp. */
  readonly grantedAt: string;
  /** ISO-8601 timestamp or null for perpetual. */
  readonly expiresAt: string | null;
}

/** The Phase-2 license repository contract (RLS-scoped, session-bound). */
export interface LicenseRepository {
  getActiveLicense(userId: string): Promise<LicenseRecord | null>;
  listLicenses(userId: string): Promise<readonly LicenseRecord[]>;
}

const PHASE_2_MARKER =
  "features/license is a Phase-2 seam — not implemented in Phase 1 (Wave-0 scaffold).";

/**
 * Phase-2 wire-in. Throws until Lane B implements it against
 * `@/data/repositories/license`. Present now only to fix the contract shape.
 */
export async function getActiveLicense(
  userId: string,
): Promise<LicenseRecord | null> {
  void userId; // reserved for the Phase-2 RLS-scoped implementation
  throw new Error(PHASE_2_MARKER);
}

/** Phase-2 wire-in. See {@link getActiveLicense}. */
export async function listLicenses(
  userId: string,
): Promise<readonly LicenseRecord[]> {
  void userId; // reserved for the Phase-2 RLS-scoped implementation
  throw new Error(PHASE_2_MARKER);
}
