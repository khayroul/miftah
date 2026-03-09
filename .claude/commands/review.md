---
description: Review uncommitted changes for security, quality, and project conventions.
---

# Code Review

1. Run `git diff --name-only HEAD` to get changed files
2. Run `git diff` to see the actual changes
3. For each changed file, check:

**CRITICAL (block commit):**
- Hardcoded secrets (API keys, tokens, passwords)
- SQL injection (string concatenation in queries)
- Missing Supabase RLS on new tables

**HIGH (should fix):**
- Object/array mutation instead of spread
- Functions > 50 lines or files > 800 lines
- Missing error handling or empty catch blocks
- Missing graceful degradation (crashes on missing assets)
- `console.log` left in production code
- SM-2 or custom FSRS math (must use ts-fsrs)

**MEDIUM (note):**
- Missing tests for new code paths
- TODO/FIXME without explanation
- Unused imports or dead code

4. Output a severity table and verdict (Approve / Warning / Block)
