/**
 * features/auth — PUBLIC INTERFACE (barrel)
 *
 * Phase-1 public client-safe Auth surface. Phase 2 activates the RLS and
 * entitlement behavior; this boundary preserves the existing session flows.
 *
 * Boundary rules (spec §2, §4.4 — enforced by eslint.config.mjs):
 *  - Other features import `auth` only via this barrel (`@/features/auth`).
 *  - Within this feature use relative imports.
 *  - Session client lives in `@/data/supabase/rls.ts`; DB reads route through
 *    `@/data/repositories/auth`.
 *
 * See docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md §3.7, §8(1).
 */
export { AuthSignInForm } from "./components/AuthSignInForm";
export { AuthStatusButton } from "./components/AuthStatusButton";
export {
  MAGIC_LINK_DEFAULT_COOLDOWN_SECONDS,
  buildMagicLinkPath,
  buildSignInPath,
  formatCooldownDuration,
  getMagicLinkCooldownSeconds,
  sanitizeNextPath,
} from "./domain/navigation";
export type { AuthErrorLike } from "./domain/navigation";
