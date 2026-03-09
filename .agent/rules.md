# Miftah — Project Rules

Read `AGENTS.md` in the project root for full project context, file map, conventions, and rules.

## Quick Reference

- **Stack:** Next.js 16, Tailwind CSS 4, Supabase, ts-fsrs, grammy
- **FSRS only.** Never implement SM-2 or raw FSRS math. Use ts-fsrs library.
- **QCF V2 fonts for Arabic.** No Pango/HarfBuzz/Cairo — they break pre-shaped glyphs.
- **Reading mode stays sacred.** Minimal UI chrome.
- **Graceful degradation.** Missing manifest = image without hitboxes. Missing word = text fallback. Never crash.
- **Commits:** conventional format (`feat:`, `fix:`, `chore:`, `docs:`)
- **Branches:** `phase-{N}/{feature-name}`
- **Run `npm run build` after frontend changes**
