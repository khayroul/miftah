# Miftah Telegram bot — RETIRED for v1

**Status:** RETIRED for v1 (operator decision, 2026-07-13).
**Disposition:** Parked, **not deleted**. The source under `src/bot/` is kept
intact so the bot can be revived in a later version.

## What "retired" means here

- The bot is **not part of the app**. `npm run build` (`next build`) and
  `npm start` (`next start`) do **not** launch it — the Next.js app never imports
  `src/bot/*`.
- The npm launch scripts are neutralized: `npm run bot`, `npm run bot:dev`,
  `npm run bot:service:install`, and `npm run bot:service:start` now print this
  notice and exit non-zero instead of starting the bot.
- Defense in depth: even if the bot process is started manually, its auth
  middleware now **fails CLOSED** — an empty/unset `TELEGRAM_ALLOWED_CHAT_IDS`
  makes it **refuse ALL traffic** (previously it failed OPEN and let everyone
  through in "dev mode"). See `src/bot/index.ts`.

## Operator action required — stopping a running service

If a `launchd` (macOS) or `systemd` (Linux) service for the bot is **already
installed and running**, this lane **cannot** stop it — that is an operator ops
action. To stop and remove it:

```bash
# macOS launchd (these scripts are intentionally left functional):
npm run bot:service:stop        # stop the running launchd job
npm run bot:service:uninstall   # remove the launchd plist so it won't restart
npm run bot:service:status      # confirm it is no longer loaded/running
npm run bot:service:logs        # inspect logs if needed
```

For a `systemd` unit, use the equivalent `systemctl --user stop <unit>` /
`systemctl --user disable <unit>` (or system-level, depending on install).

Confirm the process is gone (no polling) before considering the bot fully off.

## Reviving in a later version

1. Restore the original `bot` / `bot:dev` / `bot:service:*` scripts in
   `package.json`.
2. Set `TELEGRAM_BOT_TOKEN` and a non-empty `TELEGRAM_ALLOWED_CHAT_IDS`
   (fail-closed auth requires the allowlist).
3. Re-install/start the service.
