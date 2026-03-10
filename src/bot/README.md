# Miftah Bot Runtime

## Health command

- `/health` returns:
  - uptime
  - polling state + retry count
  - supabase ping status/latency
  - lock file owner PID
  - last polling error (if any)
  - startup diagnostics summary

## Run as launchd service (macOS)

From project root:

```bash
npm run bot:service:install
npm run bot:service:status
```

Service control:

```bash
npm run bot:service:start
npm run bot:service:stop
npm run bot:service:uninstall
```

Logs:

```bash
npm run bot:service:logs
```

## Notes

- Single-instance lock file: `.tmp/miftah-bot.lock`
- Use `BOT_STARTUP_STRICT=1` to fail fast when startup diagnostics fail.
