# AI Meeting Intervention — Remaining Work

The "AI employee joins the meeting and intervenes" concept (Epic #44) is largely
implemented. G1, G2, G4, G5 shipped in PR #62 and the review follow-up PR #65;
their behavior is documented in `docs/meeting-tool-implementation.md`. Only G3
remains, and it is a runtime-verification task that cannot be exercised in CI.

## G3: Real-Time Audio Ingestion via Worker (#47)

### Status

The orchestration is implemented as a scaffold in `apps/worker/src/realtime/`
(`manager.ts`, `realtime-session.ts`, `types.ts`) and wired into a `realtime`
worker mode that starts/stops a per-room session from LiveKit
`room_started` / `room_finished` webhooks. The two external bindings are
isolated behind interfaces and currently throw until wired:

- **Media plane** — `rtc-node-audio-source.ts`: connect as a hidden
  `worker-{meetingId}` participant with `@livekit/rtc-node`, subscribe to remote
  audio tracks, and surface decoded PCM chunks.
- **STT** — `google-stt-transcriber.ts`: Google Cloud Speech `streamingRecognize`
  (LINEAR16, interim results) per participant.

### Remaining to complete G3

1. Add `@livekit/rtc-node` + `@google-cloud/speech` and implement the two
   factories against a live LiveKit server (the only unverified pieces).
2. Configure LiveKit `webhook.urls` to also deliver to the `agent-worker`
   endpoint (`:8787/livekit/webhook`) — the default only targets the API, so
   `room_started` / `room_finished` never reach the worker otherwise. See
   `apps/worker/src/realtime/README.md` and the `agent-worker` service comment in
   `docker-compose.yml`.
3. Verify transcript segments appear within 2–3s of speech and that the
   autonomous evaluator (G4) fires on near-live transcripts.
4. **Server-side agent audio publish for autonomous interventions.** Manual
   responses already broadcast voice via the frontend relay (G2), but autonomous
   interventions are server-generated and text-only. Publishing their audio to
   the room requires the server/worker RTC path established here.

### Acceptance Criteria

- [ ] Worker subscribes to participant audio in real time
- [ ] Transcript segments appear in DB within 2–3 seconds of speech
- [ ] Autonomous agent evaluates on live transcripts (not just post-hoc DB reads)
- [ ] Worker auto-leaves when the room empties
- [ ] Autonomous interventions are spoken into the room (not text-only)

### Open Decisions

- Node (`@livekit/rtc-node` / `@livekit/agents`) vs Python for the media/STT path.
- Whether to keep the realtime worker as a `mode` of `apps/worker` or split it
  into a dedicated package once the native deps land.
