# Realtime transcription (G3)

Subscribes to participant audio in a live LiveKit room, runs streaming
speech-to-text, and ingests transcript segments via the internal room-ai API —
so the autonomous agent (G4) evaluates near-live transcripts instead of
post-recording STT.

Issue: grand2-products/echolore#47 · Epic #44

## Architecture

```
LiveKit webhook (room_started / room_finished)
        │
        ▼
RealtimeTranscriptionManager      manager.ts   — one session per live room
        │
        ▼
RealtimeTranscriptionSession      realtime-session.ts
   ├── RoomAudioSource            ← participant PCM chunks  (boundary A)
   ├── AudioTranscriber (per participant) ← streaming STT   (boundary B)
   └── SegmentSink → POST /internal/room-ai/meetings/:id/transcript-segments
```

The orchestration (`manager.ts`, `realtime-session.ts`) is pure and injected via
the interfaces in `types.ts`, so it is unit-testable without LiveKit or STT.

## Runtime-verification boundaries

Two pieces require real infrastructure and are **not exercised in CI**. Both
factories throw a descriptive error until wired:

| Boundary | File | Needs |
|----------|------|-------|
| A — room media | `rtc-node-audio-source.ts` | `@livekit/rtc-node` (native); connect as hidden `worker-{meetingId}`, subscribe audio tracks, decode PCM frames |
| B — streaming STT | `google-stt-transcriber.ts` | `@google-cloud/speech` `streamingRecognize` (LINEAR16, interim results) |

Each file documents the intended implementation inline. Wiring them and
verifying against a live LiveKit server + Google STT completes G3.

## Running

```
ROOM_AI_WORKER_MODE=realtime
ROOM_AI_LANGUAGE_CODE=ja-JP
```

Point the LiveKit webhook at this worker's `:ROOM_AI_WEBHOOK_PORT/livekit/webhook`.
See the `agent-worker` service in `docker-compose.yml`.
