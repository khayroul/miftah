# Security Rules

## Never Do

- Never hardcode secrets (API keys, passwords, tokens) — always use `process.env`
- Never use string concatenation for SQL — parameterized queries only
- Never trust external data without validation
- Never log passwords, tokens, or PII

## Always Do

- Validate inputs with Zod schemas at system boundaries
- Use Supabase RLS for row-level access control
- Sanitize user-generated content before rendering
- Handle errors explicitly — never silently swallow them

## Before Committing

- No secrets in source code
- No `console.log` with sensitive data
- Error messages don't leak internal details to users
