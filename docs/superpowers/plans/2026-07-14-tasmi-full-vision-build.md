# Tasmi' Full-Vision Build Plan — 2026-07-14

**Goal:** Ship a genuinely usable Tasmi' (voice recitation checker) as part of the re-ship —
Mode A (recite-a-page with live word-follow highlight + talqin correction) AND Mode B
(juzuk exam), on a redeployed self-hosted transcription server running the Quran-tuned model.

**Operator decisions (2026-07-14):** (1) Transcription runs on the operator's **own VPS**
(redeploy + rotate the leaked credential; keeps the Quran-tuned Whisper model + full control).
(2) Scope = **full vision** — Mode A live highlight + Mode B exam.

**Inputs / references:**
- Vision spec: `docs/superpowers/specs/2026-07-13-tasmi-mode-design-operator-vision.md`
- Engine ladder + spike: `docs/superpowers/specs/2026-07-13-tasmi-engine-upgrade-ladder.md`
- UX audit (defect list, this session): 6 BLOCKER / 14 MAJOR / 9 MINOR / 6 POLISH — the
  authoritative task backlog for Waves 0–4.
- Engine proven working locally this session (faster-whisper `small`, CPU, transcribed
  Al-Fatihah cleanly). The blocker was never the brains — it was the surround.

---

## Waves

### Wave 0 — Foundation: make it work, honest, and guided
Prerequisite for both modes. No new features — correctness + first-use + iOS.
- [x] **Reachability check** — `GET /api/tasmi/transcribe` now pings the server `/health`
  (3s timeout) and returns `{configured, reachable}`, not just `{configured}`.
  (`src/app/api/tasmi/transcribe/route.ts`) ✅ landed + verified.
- [x] **Honest failure** — transport failures and empty transcription no longer masquerade
  as recitation mistakes / fire false talqin / degrade the FSRS score. New session events
  `server-unavailable` and `no-speech`; `end()` is idempotent.
  (`src/features/tasmi/domain/tasmi-session.ts` + 4 new tests) ✅ landed, 79/79 green.
- [x] **Onboarding + explicit start gesture** — mic-auto-start replaced with an intro card
  (3-step BM explanation incl. talqin gloss + mic-privacy note); **Mula** tap is the user
  gesture. (`TasmiSessionUI.tsx`) ✅
- [x] **iOS audio unlock in the tap** — a silent-WAV-primed shared `HTMLAudioElement` is
  unlocked inside the Mula tap and reused for all talqin via
  `TalqinPlayer.attachAudioElement()`; contract locked by 2 unit tests. Mic start now also
  originates from the tap (no mount auto-start). (`TasmiSessionUI.tsx` + `talqin-player.ts`) ✅
- [x] **Honest UI states** — `server-unavailable` → pause + honest banner ("bacaan anda tidak
  dikira salah") + "Sambung Semula" resume-after-reprobe; `no-speech` → gentle hint; new
  `checking`/`intro`/`unavailable` states; pre-flight consumes `{configured, reachable}`. ✅
- [x] **Clean lifecycle** — recorder+talqin stopped on natural completion AND session-end;
  `teardown()` before every (re)start so retry can't stack a second VAD; `cancelledRef`
  aborts in-flight async start; refs assigned before awaits. ✅
- [x] **Mic-permission UX** — `TasmiRecorderError` with classified kinds
  (permission-denied / no-mic / unknown) → actionable BM copy. (`tasmi-recorder.ts`) ✅
- [x] **Don't punish early stop** — manual "Hentikan" before the end marks the result
  `endedEarly`: not saveable (no FSRS damage), explanatory note shown. Also: m:ss duration,
  talqin stat glossed, aria-live status announcements. (`TasmiSessionResultView.tsx`) ✅
- [x] **Talqin = 3 linked words** (spec) — was 5. ✅
- **Gate status:** `tsc` 0 · lint 0 · 81/81 hifz+tasmi tests · `next build` 34/34 ✅ ·
  pre-flight E2E verified live (server up → `reachable:true`; killed → `reachable:false` in
  35ms; restored → true) ✅ · **REMAINING:** logged-in recite loop + iOS talqin smoke =
  operator device (Wave 3).

### Wave 1 — Mode A: live word-follow highlight (the spec core)
- [ ] Render the range's Arabic text (RTL, Uthmani font) inside the session; drive a
  correct/current/error highlight from `match`/`error` word indices.
- [ ] Phrase-level fallback per the spike (word-level real-time not feasible on CPU).
- [ ] Fix matcher post-error truncation (audit T-01, `sequence-matcher.ts`) + a
  producer→consumer boundary test for the normalization↔quran-align index mapping.
- [ ] Talqin = 3 linked words (spec), not 5.
- **Gate:** matcher/highlight unit tests; real-render look at the highlight following recitation.

### Wave 2 — Mode B: juzuk exam
- [ ] Session-start **exam / practice** toggle.
- [ ] Random test-ayah picker within a juz; read-aloud start prompt (reuse
  `TalqinPlayer.playRange`); recite-to-page-end; **NEXT** loop to the next test ayah.
- [ ] Exam-mode result/session handling.
- **Gate:** picker + loop unit tests; end-to-end exam run locally.

### Wave 3 — VPS deploy + wire + end-to-end verify  *(operator-gated infra)*
- [ ] Operator: rotate the leaked credential; redeploy `tasmi-server/` (runbook below).
- [ ] Point Vercel env `TASMI_SERVER_URL` + `TASMI_API_KEY` at the new server.
- [ ] Operator logged-in end-to-end smoke (recite → highlight → talqin → result) on device.
- **Gate:** live `/health` reachable; real recitation transcribes; talqin plays on iOS.

### Wave 4 — Polish + a11y + entry clarity
- [ ] Result screen: show error **positions** (which ayah/word), `m:ss` duration, tailored
  encouragement, "Talqin" glossed. (`TasmiSessionResultView.tsx`)
- [ ] `aria-live` status announcements for the voice UI; non-color state differentiation.
- [ ] Standardize Malay register; gloss "talqin" on first use.
- [ ] Entry clarity: the name "Tasmi'" is overloaded (a manual reveal veil vs the voice
  session) — disambiguate; fix the action-sheet copy so the voice mode is discoverable and
  described correctly. ("Uji Hafalan" currently routes to the FSRS queue, not voice.)
- **Gate:** build + a11y smoke.

---

## VPS deploy runbook (operator — Wave 3, can start now in parallel)

The server lives in `tasmi-server/` (FastAPI + faster-whisper, Dockerfile + `setup.sh` +
`tasmi.service`). It needs a persistent public HTTPS host (Vercel can't run it).

1. **Rotate the leaked credential** on the VPS (new SSH key / password); never reuse the old.
2. **Provision** (Ubuntu, ≥4 GB RAM for the model; 2 vCPU fine for CPU int8).
3. **Deploy:**
   ```bash
   scp -r tasmi-server/ user@<VPS_IP>:/tmp/tasmi-server/
   ssh user@<VPS_IP> 'cd /tmp/tasmi-server && sudo bash setup.sh'
   ```
   `setup.sh` installs Python 3.11, a venv, deps, and the `tasmi.service` systemd unit under
   `/opt/tasmi`.
4. **Env on the server** (systemd unit / env file): set a **new** `TASMI_API_KEY` (long random),
   and `WHISPER_MODEL` — `large-v3` (best general Arabic, ~3 GB) or convert the Quran-tuned
   `tarteel-ai/whisper-base-ar-quran` to CTranslate2 for best recitation accuracy. Put it
   behind HTTPS (Caddy/nginx + certbot) at e.g. `https://tasmi.<yourdomain>`.
5. **Point the app at it** — in Vercel project env (Production): `TASMI_SERVER_URL` =
   the HTTPS URL, `TASMI_API_KEY` = the new key. (The client never sees the key; the Next
   route proxies server-side.) Update the server's CORS `allow_origin_regex` in `main.py` if
   your prod domain isn't `*.vercel.app`/`miftah.app`.
6. **Verify:** `curl https://tasmi.<yourdomain>/health` → `{"status":"ok",...}`. Then the
   app's `GET /api/tasmi/transcribe` returns `{configured:true, reachable:true}`.

---

## Exit criteria (feature "done")
- Mode A: reciter opens Tasmi', reads an intro, taps Mula, recites; on-page words highlight as
  recited; a genuine mistake (not server/silence) plays 3-word talqin; result shows accuracy +
  where errors were. Works on iOS.
- Mode B: exam toggle → random test ayah read aloud → recite to page end → NEXT loops.
- Server down / mic denied / no speech all degrade honestly (no false "mistake" or bad score).
- `test:hifz-tasmi` + `tsc` + `next build` green; operator device smoke passed.

## Status ledger
- 2026-07-14: Wave 0 reachability + honest-failure landed & verified (79/79). Engine proven
  local. Remaining Wave 0 (onboarding/gesture/iOS/lifecycle) + Waves 1–4 open. VPS = operator.
