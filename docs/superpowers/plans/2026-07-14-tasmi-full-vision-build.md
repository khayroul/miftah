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
- [x] **`TasmiTextFollow`** — renders the range's Uthmani text (RTL, `--font-arabic`);
  recited words fill teal, the next word pulses amber, error positions tint rose;
  auto-scrolls the current word into view. Wired into the live session view; state
  driven from `match`/`error` events; reset per session. ✅
- [x] **Phrase-level follow** per the spike — highlight advances per verified chunk. ✅
- [x] **T-01 fixed with anchored-cursor semantics** — a mid-chunk substitution no longer
  discards the rest of the chunk (post-slip words credited, session can complete), while a
  TRAILING unanchored substitution holds the cursor so talqin corrects the word actually
  recited wrongly. Scoring subtracts substituted/omitted positions inside the advanced span.
  Both pre-existing matcher tests pass UNCHANGED + 2 new session tests. ✅
- [x] **Boundary test** (`TasmiTextFollow.boundary.test.ts`, added to `test:hifz-tasmi`) —
  locks display↔matcher index alignment incl. tokens that normalize to empty. ✅
- [x] Talqin = 3 linked words (landed in Wave 0). ✅
- **Gate status:** tsc 0 · lint 0 · 87/87 · build 34/34 ✅. **REMAINING:** real-render look
  at the highlight during actual recitation = operator logged-in smoke (Wave 3).

### Wave 2 — Mode B: juzuk exam
- [x] **Exam/practice toggle** — engine `talqinEnabled` config (exam = silent on mistakes,
  errors still scored, talqinCount stays 0; silence-timeout also suppressed); session-start
  toggle UI with per-mode explanation; intro copy adapts. 2 engine tests. ✅
- [x] **Random test-ayah picker** — `getJuzukExamRound(juz, exclude)` in the data layer
  (random ayah in juz → span to page end via id-ordered `gte`), `GET /api/tasmi/juzuk-round`
  (auth-gated, juz 1-30 validated, exclude-list for recent-repeat avoidance). Data
  assumptions PROVEN against prod read-only: 6,236 ayat, 0 null juz/page, id ordering has
  0 recitation-order violations; real span checks (juz-1 first ayah → 7 to page end). ✅
- [x] **Read-aloud start prompt** — `TalqinPlayer.playAyah()` plays the test ayah after
  "Mula" (recorder paused → resumes into listening on playback end); new `prompt` status. ✅
- [x] **NEXT loop** — `TasmiJuzukExam` component: juz picker + toggle → round → save →
  next random test ayah (recent-20 exclusion); `buildExamRound` domain builder (4 tests)
  mirrors the proven hifz word-offset algorithm; `/tasmi/juzuk` page (requireAuthUser);
  entry link on the hifz overview card. ✅
- **Gate status:** tsc 0 · lint 0 · 93/93 · build 36/36 routes ✅ · route smoke: logged-out
  `/tasmi/juzuk` → 307 sign-in, API → 401 ✅. **REMAINING:** logged-in end-to-end exam run =
  operator device (Wave 3).

### Wave 3 — VPS deploy + wire + end-to-end verify  *(operator-gated infra)*
- [x] **VPS redeployed and LIVE** (operator + Codex, 2026-07-15). Verified from Tower:
  `https://tasmi.kaa.business/health` → 200 `{"status":"ok","model":
  "OdyAsh/faster-whisper-base-ar-quran","beam_size":1,"streaming":true,
  "stream_protocol":"tasmi-stream-v1","max_concurrent_streams":2}` — i.e. the
  **Quran-tuned model the spike recommended (Rung 1)**, with streaming. ✅
- [x] Vercel env wired: production `GET /api/tasmi/transcribe` →
  `{"configured":true,"reachable":true}`. Tasmi is reachable end-to-end for the
  first time. `/ws/transcribe` exists and is auth-gated (403 without key). ✅
- [ ] ⚠️ **Credential rotation still NOT done** (operator deferred 2026-07-15).
  The leaked VPS credential remains valid. Rotate before public relaunch.
- [ ] Operator logged-in end-to-end smoke on device (recite → highlight → talqin
  → result). **The one gate code cannot self-clear.**
- **Gate:** live `/health` reachable ✅; real recitation transcribes (pending device
  smoke); talqin plays on iOS (pending device smoke).

### Wave 3.5 — Near-live streaming (Codex, 2026-07-15) — LANDED, unverified on device
- [x] WebSocket streaming path: `tasmi-stream-v1` protocol, `tasmi-stream-client.ts`,
  `/api/tasmi/stream-session` (auth-gated), server rewrite + nginx example + README.
- [x] **Honest degradation preserved**: on stream loss, buffered utterances replay
  through the batch path (`onUnavailable` → `setStreamMode("fallback")` + BM hint)
  — recitation is never lost, never scored as a mistake.
- [x] **Security fix (Codex caught a Tower miss)**: `getTasmiApiKey()` refuses the
  `NEXT_PUBLIC_` fallback in production, so the long-lived VPS credential can no
  longer be bundled into browser code.
- [x] Tower re-verified at `efeccfb1`: tsc 0 · lint 0 · **136/136** hifz+tasmi ·
  **76/76** pwa. Wave-0/1/2 safety work intact (honest events, iOS audio unlock,
  endedEarly, Mode B toggle all still present).
- [x] **Pilot guardrail:** `max_concurrent_streams: 1` deliberately admits one live
  reciter. Additional users receive the dedicated "Tasmi' sedang penuh" state and
  can retry without starting or grading a session. Raise this limit only after the
  VPS has been load-tested; this is not capacity for 71 simultaneous reciters.

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
