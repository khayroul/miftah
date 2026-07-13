export interface AuthErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

export const MAGIC_LINK_DEFAULT_COOLDOWN_SECONDS = 60;

export function sanitizeNextPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  // Reject backslashes: browsers normalize "\" to "/", so "/\evil.com"
  // resolves to "//evil.com" → https://evil.com/ (open redirect).
  if (value.includes("\\")) {
    return fallback;
  }

  // Belt-and-braces: resolve against a fixed origin and confirm the result
  // stays same-origin. Anything that escapes localhost (protocol-relative,
  // absolute URL, or host injection that slipped past the checks above) is
  // rejected rather than returned to the redirect target.
  try {
    const resolved = new URL(value, "http://localhost");
    if (resolved.origin !== "http://localhost") {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return value;
}

export function buildSignInPath(nextPath: string): string {
  return `/auth/sign-in?next=${encodeURIComponent(nextPath)}`;
}

export function buildMagicLinkPath(nextPath: string): string {
  return `/auth/magic?next=${encodeURIComponent(nextPath)}`;
}

export function getMagicLinkCooldownSeconds(
  error: AuthErrorLike | null,
): number | null {
  if (!error) {
    return null;
  }

  const isRateLimited =
    error.code === "over_email_send_rate_limit" ||
    error.status === 429 ||
    error.message?.toLowerCase().includes("rate limit") === true;

  if (!isRateLimited) {
    return null;
  }

  const parsedSeconds = parseCooldownSeconds(error.message);
  return parsedSeconds ?? MAGIC_LINK_DEFAULT_COOLDOWN_SECONDS;
}

export function formatCooldownDuration(seconds: number): string {
  const normalizedSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  if (remainingSeconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes} min ${remainingSeconds}s`;
}

function parseCooldownSeconds(message: string | undefined): number | null {
  if (!message) {
    return null;
  }

  const normalizedMessage = message.toLowerCase();
  const minuteMatch = normalizedMessage.match(/(\d+)\s*(minute|minutes|minit|min)/);
  if (minuteMatch) {
    return Number(minuteMatch[1]) * 60;
  }

  const secondMatch = normalizedMessage.match(/(\d+)\s*(second|seconds|sec|secs|saat|s)/);
  if (secondMatch) {
    return Number(secondMatch[1]);
  }

  return null;
}
