# Tasmi transcription server

The service exposes the existing authenticated `POST /transcribe` WAV fallback,
an authenticated one-time ticket endpoint, and `GET /ws/transcribe` for the
near-live PCM stream. Uvicorn must remain loopback-only; nginx is the public TLS
boundary.

## Deploy/update checklist

1. Copy the whole directory so `main.py`, `normalizer.py`, and `streaming.py`
   stay together, then run `sudo bash setup.sh`.
2. Add the exact production frontend origins to `TASMI_ALLOWED_ORIGINS` as a
   comma-separated list. Do not use a wildcard preview-domain rule.
3. Install `nginx.conf.example` as the TLS site (merging certificate paths with
   the existing Certbot site), then run `sudo nginx -t` before reloading nginx.
4. If an older setup opened the model port, remove that obsolete firewall rule:
   `sudo ufw delete allow 8000/tcp`. Port 8000 must not be internet-facing.
5. Keep one Uvicorn worker. The application owns a single bounded inference
   worker because one shared `WhisperModel` must not run concurrently.
   The service stores its model cache under `/opt/tasmi/.cache/huggingface`,
   which remains available with systemd home-directory protection enabled.

The browser-to-server protocol is `tasmi-stream-v1`:

- The first WebSocket frame is JSON: `{"type":"auth","ticket":"..."}`.
- The server replies with `ready` and requires mono PCM16LE at 16 kHz.
- Browser VAD sends `speech_start` and `speech_end` JSON controls with a numeric
  `utterance_id`; IDs must increase within the connection, and binary audio
  frames may flow continuously between controls.
- `partial` is tentative. Only `final` is suitable for committing matcher state;
  final messages are emitted in increasing utterance order for each connection.
  At speech end, queued partial work is promoted to final priority while an
  identical partial already running in the native model is reused.
- `pause` discards incoming audio until `resume`, preventing talqin playback
  from being recognized as the reciter.
- Idle and total connection lifetimes are bounded; a client reconnects with a
  newly minted one-time ticket when the server closes an expired session.

## Verification before public traffic

Run source checks before installation; they use only the Python standard library
and do not load the model:

```bash
cd /tmp/tasmi-server
python3 -m unittest -v test_streaming.py
python3 -m py_compile main.py normalizer.py streaming.py
```

After starting the service, verify its network and health boundary:

```bash
sudo systemctl status tasmi --no-pager
sudo ss -lntp | grep ':8000'
curl -fsS http://127.0.0.1:8000/health
curl -fsS https://tasmi.kaa.business/health
sudo nginx -t
```

The `ss` output must show `127.0.0.1:8000`, never `0.0.0.0:8000`.

With `TASMI_API_KEY` loaded into the operator shell, verify ticket single use and
the HTTP fallback with a real 16 kHz mono PCM16 WAV:

```bash
curl -fsS -X POST -H "x-api-key: $TASMI_API_KEY" \
  https://tasmi.kaa.business/stream-ticket
curl -fsS -H "x-api-key: $TASMI_API_KEY" \
  -F file=@sample.wav https://tasmi.kaa.business/transcribe
```

Finally, connect through `wss://tasmi.kaa.business/ws/transcribe` from an exact
allowlisted Origin and check these cases: valid ticket reaches `ready`; reusing
the same ticket is rejected; a wrong Origin is rejected; partial messages arrive
while speaking; `speech_end` yields one final; disconnecting during inference
does not allow a second model call to overlap; and an HTTP transcription still
works after the WebSocket disconnect.

Operational logs contain byte counts and timing only. They must never contain
raw or normalized recitation text.
