import type {
  AudioChunk,
  AudioTranscriber,
  AudioTranscriberFactory,
  RoomAudioSource,
  SegmentSink,
  TranscriptResult,
} from "./types.js";

export interface RealtimeTranscriptionSessionOptions {
  meetingId: string;
  languageCode: string;
  source: RoomAudioSource;
  createTranscriber: AudioTranscriberFactory;
  sink: SegmentSink;
  /** Provider label recorded on each segment. Defaults to "google". */
  provider?: string;
  /** Injectable clock for testing. */
  now?: () => Date;
}

interface ParticipantState {
  transcriber: AudioTranscriber;
  /** Monotonic utterance index → stable segmentKey across a partial→final run. */
  utterance: number;
  startedAt: string;
}

/**
 * Transcribes a single meeting room in real time: routes each participant's
 * audio to its own streaming transcriber and forwards (partial + final)
 * results to the segment sink. Pure orchestration — the media source and the
 * transcriber are injected, so this is unit-testable without LiveKit or STT.
 */
export class RealtimeTranscriptionSession {
  private readonly participants = new Map<string, ParticipantState>();
  private readonly provider: string;
  private readonly now: () => Date;
  private started = false;
  private stopped = false;

  constructor(private readonly opts: RealtimeTranscriptionSessionOptions) {
    this.provider = opts.provider ?? "google";
    this.now = opts.now ?? (() => new Date());
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.opts.source.onAudioChunk((chunk) => {
      this.handleChunk(chunk);
    });
    this.opts.source.onParticipantLeft((identity) => {
      void this.closeParticipant(identity);
    });

    await this.opts.source.connect();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    for (const state of this.participants.values()) {
      await state.transcriber.close().catch(() => {});
    }
    this.participants.clear();
    await this.opts.source.disconnect().catch(() => {});
  }

  private ensureParticipant(participantIdentity: string): ParticipantState {
    const existing = this.participants.get(participantIdentity);
    if (existing) return existing;

    const transcriber = this.opts.createTranscriber(participantIdentity, this.opts.languageCode);
    const state: ParticipantState = {
      transcriber,
      utterance: 0,
      startedAt: this.now().toISOString(),
    };
    transcriber.onResult((result) => {
      void this.handleResult(participantIdentity, result);
    });
    this.participants.set(participantIdentity, state);
    return state;
  }

  private handleChunk(chunk: AudioChunk): void {
    if (this.stopped) return;
    this.ensureParticipant(chunk.participantIdentity).transcriber.pushAudio(chunk);
  }

  private async handleResult(participantIdentity: string, result: TranscriptResult): Promise<void> {
    const state = this.participants.get(participantIdentity);
    if (!state) return;

    const text = result.text.trim();
    if (!text) return;

    // Partials within one utterance reuse the same segmentKey so the server
    // upserts in place; the final result closes the segment.
    const segmentKey = `${participantIdentity}-${state.utterance}`;

    try {
      await this.opts.sink.submit({
        participantIdentity,
        speakerLabel: participantIdentity,
        content: text,
        isPartial: !result.isFinal,
        segmentKey,
        provider: this.provider,
        confidence: result.confidence ?? null,
        startedAt: state.startedAt,
        finalizedAt: result.isFinal ? this.now().toISOString() : null,
      });
    } catch (err) {
      console.error(`[realtime] failed to submit segment for ${participantIdentity}`, err);
    }

    if (result.isFinal) {
      state.utterance += 1;
      state.startedAt = this.now().toISOString();
    }
  }

  private async closeParticipant(participantIdentity: string): Promise<void> {
    const state = this.participants.get(participantIdentity);
    if (!state) return;
    this.participants.delete(participantIdentity);
    await state.transcriber.close().catch(() => {});
  }
}
