---
description: Fix Next.js / TypeScript build errors with minimal changes. No refactoring.
---

# Build Fix

1. Run `cd ~/miftah && npm run build` and capture all errors
2. Group errors by file
3. Fix one error at a time with the smallest possible change:
   - Missing type → add annotation
   - Object possibly undefined → add `?.` or null check
   - Property does not exist → add to interface or use optional `?`
   - Cannot find module → fix import path
   - Type not assignable → fix the type or add conversion
   - Server/client component mismatch → add `"use client"` or restructure
4. Re-run `npm run build` after each fix
5. Stop and ask user if:
   - A fix introduces more errors than it resolves
   - Same error persists after 3 attempts
   - Fix requires architectural changes

**DO:** Add types, null checks, fix imports
**DON'T:** Refactor, rename, restructure, change logic
