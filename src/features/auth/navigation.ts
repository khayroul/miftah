/** Lightweight public entry for pure Auth navigation helpers. */
export {
  MAGIC_LINK_DEFAULT_COOLDOWN_SECONDS,
  buildMagicLinkPath,
  buildSignInPath,
  formatCooldownDuration,
  getMagicLinkCooldownSeconds,
  sanitizeNextPath,
} from "./domain/navigation";
export type { AuthErrorLike } from "./domain/navigation";
