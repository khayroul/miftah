import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Phase-1 architecture boundary rule (spec §4.4, §9 anti-drift).
 *
 * Supabase clients may be imported ONLY from within `src/data/**`. Everywhere
 * in the new architecture zones (features/ui/shared/mushaf), code consumes
 * typed repositories from `@/data/repositories/*` instead of a client.
 *
 * SCOPING: these `paths`/`patterns` are attached ONLY to the new zones via the
 * `files` globs below. The existing flat `src/lib`, `src/components`, `src/app`
 * and `src/bot` code is intentionally NOT covered — it legitimately imports the
 * Supabase clients today, and comes under this rule only as it migrates in
 * later waves. So this rule adds ZERO errors to current code.
 */
const supabaseClientPaths = [
  {
    name: "@supabase/supabase-js",
    message:
      "Import a typed repository from @/data/repositories/*, not a Supabase client. Only src/data/** may construct a Supabase client (spec §4.4).",
  },
  {
    name: "@supabase/ssr",
    message:
      "Import a typed repository from @/data/repositories/*, not a Supabase client. Only src/data/** may construct a Supabase client (spec §4.4).",
  },
  {
    name: "@/lib/supabase",
    message:
      "Use @/data/repositories/* (via @/data/supabase/browser inside data/ only). Supabase clients are confined to src/data/** (spec §4.4).",
  },
  {
    name: "@/lib/supabase-server",
    message:
      "Use @/data/repositories/* (via @/data/supabase/server inside data/ only). Supabase clients are confined to src/data/** (spec §4.4).",
  },
  {
    name: "@/lib/supabase-auth",
    message:
      "Supabase clients are confined to src/data/**. Route through a repository (spec §4.4).",
  },
  {
    name: "@/lib/supabase-auth-server",
    message:
      "Supabase clients are confined to src/data/**. Route through a repository (spec §4.4).",
  },
];

const supabaseClientPatterns = [
  {
    group: ["@/data/supabase/*", "@/data/supabase/**"],
    message:
      "Do not import a Supabase client (@/data/supabase/*) outside src/data/**. Features/ui/shared/mushaf consume @/data/repositories/* (spec §4.4).",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored dataset transformation source (kept as external reference code).
    "data/mushaf-layout/src/**",
  ]),

  // ── Phase-1 boundary: features/** ──────────────────────────────────────────
  // (a) no cross-feature INTERNAL imports — another feature is reachable only
  //     through its public barrel `@/features/<name>` (deep paths `@/features/
  //     <name>/...` are forbidden; within a feature, use relative imports).
  // (b) no Supabase client imports (confined to src/data/**).
  {
    files: ["src/features/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: supabaseClientPaths,
          patterns: [
            {
              group: ["@/features/*/**"],
              message:
                "Import another feature only through its public barrel `@/features/<name>` — not its internals. Within a feature use relative imports (spec §4.4).",
            },
            ...supabaseClientPatterns,
          ],
        },
      ],
    },
  },

  // ── Phase-1 boundary: ui/** · shared/** · mushaf/** ─────────────────────────
  // Supabase clients confined to src/data/** (spec §4.4). These lower layers
  // route persistence through repositories, never a client directly.
  {
    files: [
      "src/ui/**/*.{ts,tsx,js,jsx,mjs,cjs}",
      "src/shared/**/*.{ts,tsx,js,jsx,mjs,cjs}",
      "src/mushaf/**/*.{ts,tsx,js,jsx,mjs,cjs}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: supabaseClientPaths,
          patterns: supabaseClientPatterns,
        },
      ],
    },
  },
]);

export default eslintConfig;
