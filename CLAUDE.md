# CLAUDE.md

Read `AGENTS.md` in this project root for full project context, file map, conventions, and rules.

## Consolidation → Rebuild → V1 Launch program (2026-07-13)

This repo is the **canonical Miftah product** (the Genesys `miftah-lab` port is demo-only — never sync from it). Program of record:

- Spec: `docs/superpowers/specs/2026-07-13-consolidation-rebuild-launch-design.md` (v1.2) — phases, lanes, exit gates
- Architecture: `docs/superpowers/specs/2026-07-13-target-architecture-DRAFT.md` (9 strangler waves)
- Current state + next steps: `docs/HANDOVER.md`

## Hard rules (session-stopping if violated)

1. **~71 real user accounts live on production.** `git push origin main` triggers a Vercel production deploy to them. Push ONLY with an explicit operator go given in the current session.
2. **Never run a Supabase migration without the spec §5 backup gate** (named `pg_dump` first, restore rehearsed). Migration `20260311114500` TRUNCATEs progress tables — any replay/reset path (`supabase db reset`, history re-apply) destroys ~42.5k rows of live data.
3. **Phase-1 waves are behavior-preserving**: tests + build green AND screenshot diff vs `docs/baseline/2026-07-13/` ≤0.1% changed pixels (pixelmatch, dynamic regions masked). Capture script: `docs/baseline/capture.mjs`.
4. Supabase MCP `list_tables` row counts are stale estimates — use live `SELECT COUNT(*)` for safety decisions.
5. Explicit `git add <paths>` only, never `-A`. One mutating actor in this repo at a time.
6. `public/sw.js` and `public/pwa-config.json` are ignored generated artifacts. `predev`/`prebuild` recreate both from `scripts/sw.template.js` through the fail-closed `scripts/render-pwa-artifacts.ts`; edit the template/renderer, never the outputs.

## Claude Code Specific

- Run `npm run build` after frontend changes to catch Next.js build errors
- QCF rendering is complex — always read the Arabic Rendering section in AGENTS.md before touching render scripts
- Prefer `Edit` over `Write` for existing files
- Component tests go alongside components, not in a separate test directory
