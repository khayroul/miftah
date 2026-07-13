import test from "node:test";
import assert from "node:assert/strict";
import {
  MAGIC_LINK_DEFAULT_COOLDOWN_SECONDS,
  buildMagicLinkPath,
  buildSignInPath,
  formatCooldownDuration,
  getMagicLinkCooldownSeconds,
  sanitizeNextPath,
} from "./navigation";

test("sanitizeNextPath keeps safe in-app paths", () => {
  assert.equal(sanitizeNextPath("/read/5"), "/read/5");
  assert.equal(sanitizeNextPath("//evil.example", "/"), "/");
  assert.equal(sanitizeNextPath("https://evil.example", "/"), "/");
  assert.equal(sanitizeNextPath(undefined, "/read"), "/read");
});

test("sanitizeNextPath rejects backslash open-redirect payloads (RF-1 F4)", () => {
  // Browsers normalize "\" to "/", so "/\evil.com" resolves to "//evil.com"
  // → https://evil.com/. These must all fall back, never pass through.
  assert.equal(sanitizeNextPath("/\\evil.com", "/"), "/");
  assert.equal(sanitizeNextPath("//evil.com", "/"), "/");
  assert.equal(sanitizeNextPath("/\\/evil.com", "/"), "/");
  assert.equal(sanitizeNextPath("/\\\\evil.com", "/"), "/");
  // A legitimate in-app path is still accepted verbatim.
  assert.equal(sanitizeNextPath("/read/1"), "/read/1");
});

test("auth path builders encode next path", () => {
  assert.equal(
    buildSignInPath("/read/1?focus=ayah"),
    "/auth/sign-in?next=%2Fread%2F1%3Ffocus%3Dayah",
  );
  assert.equal(
    buildMagicLinkPath("/faham?mode=preview"),
    "/auth/magic?next=%2Ffaham%3Fmode%3Dpreview",
  );
});

test("getMagicLinkCooldownSeconds detects rate limits", () => {
  assert.equal(
    getMagicLinkCooldownSeconds({
      code: "over_email_send_rate_limit",
      message: "Please wait 45 seconds before trying again.",
    }),
    45,
  );

  assert.equal(
    getMagicLinkCooldownSeconds({
      status: 429,
      message: "Please wait 2 minutes before requesting another email.",
    }),
    120,
  );

  assert.equal(
    getMagicLinkCooldownSeconds({
      status: 429,
      message: "Too many requests",
    }),
    MAGIC_LINK_DEFAULT_COOLDOWN_SECONDS,
  );

  assert.equal(
    getMagicLinkCooldownSeconds({
      code: "email_address_invalid",
      message: "Invalid email address",
    }),
    null,
  );
});

test("formatCooldownDuration returns compact countdown labels", () => {
  assert.equal(formatCooldownDuration(9), "9s");
  assert.equal(formatCooldownDuration(60), "1 min");
  assert.equal(formatCooldownDuration(125), "2 min 5s");
});
