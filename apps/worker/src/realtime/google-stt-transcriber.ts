import type { protos, SpeechClient } from "@google-cloud/speech";
import type { AudioChunk, AudioTranscriber, TranscriptResult } from "./types.js";

type StreamingRecognizeStream = ReturnType<SpeechClient["streamingRecognize"]>;
type StreamingResponse = protos.google.cloud.speech.v1.IStreamingRecognizeResponse;

// Audio arrives from the RTC source resampled to 16 kHz mono LINEAR16.
const STT_SAMPLE_RATE = 16_000;

// Google's `streamingRecognize` enforces a hard 5-minute cap per stream. We
// proactively rotate well before the deadline so an utterance does not get
// truncated mid-sentence. The rotation closes the previous stream gracefully
// and opens a fresh one; in-flight audio after rotation is written to the new
// stream. Tests inject a smaller value to keep them fast.
const DEFAULT_STREAM_ROTATE_MS = 4 * 60 * 1000;

export interface GoogleStreamingTranscriberOptions {
  /** Override the rotation interval. Primarily for tests. */
  rotateAfterMs?: number;
}

/**
 * Streaming `AudioTranscriber` backed by Google Cloud Speech-to-Text
 * (`streamingRecognize`). One instance per participant.
 *
 * `@google-cloud/speech` is imported dynamically on first audio so the gRPC
 * client is only loaded by the realtime worker, not by monitor / webhook modes.
 * Types come via `import type` (erased at compile time).
 *
 * RUNTIME-VERIFICATION BOUNDARY (G3): requires a reachable Google STT endpoint
 * with credentials; exercised only with real audio. The code typechecks against
 * the real SDK but its behavior must be verified against a live deployment (#47).
 */
class GoogleStreamingTranscriber implements AudioTranscriber {
  private client: SpeechClient | null = null;
  private stream: StreamingRecognizeStream | null = null;
  /**
   * In-flight `ensureStream()` invocation. Held so `close()` can wait for it to
   * settle and tear down any client/stream it produced — without this, a close
   * racing with the first `pushAudio()` would leak the SpeechClient.
   */
  private pendingInit: Promise<void> | null = null;
  private resultHandler: ((result: TranscriptResult) => void) | null = null;
  private closed = false;
  private rotateTimer: NodeJS.Timeout | null = null;
  private readonly rotateAfterMs: number;
  /** Counter used to attribute stream callbacks to the right generation. */
  private streamGeneration = 0;

  constructor(
    private readonly languageCode: string,
    options: GoogleStreamingTranscriberOptions = {}
  ) {
    this.rotateAfterMs = options.rotateAfterMs ?? DEFAULT_STREAM_ROTATE_MS;
  }

  onResult(handler: (result: TranscriptResult) => void): void {
    this.resultHandler = handler;
  }

  pushAudio(chunk: AudioChunk): void {
    void this.ensureStream()
      .then(() => {
        if (this.closed || !this.stream) return;
        const { samples } = chunk;
        const audioContent = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
        this.stream.write({ audioContent });
      })
      .catch((err) => {
        if (this.closed) return;
        console.error("[realtime] STT write failed", err);
      });
  }

  private ensureStream(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.stream) return Promise.resolve();
    if (this.pendingInit) return this.pendingInit;

    const init = (async () => {
      const speech = await import("@google-cloud/speech");
      // The init was started before close() but completed after. Drop the
      // half-built session immediately so we never leak the gRPC client.
      if (this.closed) return;

      const client = new speech.SpeechClient();
      // close() may have been called while we awaited the dynamic import.
      // Discard the client we just created so it doesn't outlive the session.
      if (this.closed) {
        await client.close().catch(() => {});
        return;
      }
      this.client = client;
      this.openStream(client);
    })();

    this.pendingInit = init;
    init.finally(() => {
      if (this.pendingInit === init) {
        this.pendingInit = null;
      }
    });
    return init;
  }

  /** Open a fresh `streamingRecognize` channel against an existing client. */
  private openStream(client: SpeechClient): void {
    const generation = ++this.streamGeneration;
    const stream = client.streamingRecognize();

    stream.on("data", (response: StreamingResponse) => {
      // Late events from a rotated-out stream (or after close) must not be
      // forwarded — they would re-emit a finalized utterance.
      if (this.closed || generation !== this.streamGeneration) return;
      const result = response.results?.[0];
      const alternative = result?.alternatives?.[0];
      if (alternative?.transcript) {
        this.resultHandler?.({
          text: alternative.transcript,
          isFinal: Boolean(result?.isFinal),
          confidence: alternative.confidence ?? undefined,
        });
      }
    });

    const handleClose = (err?: Error) => {
      if (this.closed || generation !== this.streamGeneration) return;
      if (err) {
        console.error("[realtime] STT stream error; rotating", err);
      } else {
        console.warn("[realtime] STT stream ended unexpectedly; rotating");
      }
      // Detach the dead stream so ensureStream() opens a fresh one on the
      // next chunk. Don't reconnect eagerly — without audio there's nothing
      // to transcribe, and a tight reconnect loop on a persistent failure
      // would burn quota.
      this.stream = null;
      this.clearRotateTimer();
    };
    stream.on("error", (err: Error) => handleClose(err));
    stream.on("end", () => handleClose());

    // First message configures the stream; subsequent writes carry audio.
    stream.write({
      streamingConfig: {
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: STT_SAMPLE_RATE,
          languageCode: this.languageCode,
          enableAutomaticPunctuation: true,
        },
        interimResults: true,
      },
    });

    this.stream = stream;
    this.scheduleRotation(client, generation);
  }

  /** Rotate the underlying stream after `rotateAfterMs` to dodge the 5-min cap. */
  private scheduleRotation(client: SpeechClient, generation: number): void {
    this.clearRotateTimer();
    this.rotateTimer = setTimeout(() => {
      if (this.closed || generation !== this.streamGeneration || this.client !== client) return;
      const stale = this.stream;
      this.stream = null;
      try {
        stale?.end();
      } catch {
        // Already ended.
      }
      // Open the replacement against the same client to keep the connection
      // pool warm. New chunks pushed before this completes are routed to the
      // new stream because `this.stream` is set synchronously inside openStream.
      this.openStream(client);
    }, this.rotateAfterMs);
    // Don't block process shutdown waiting for a rotation that may not fire.
    this.rotateTimer.unref?.();
  }

  private clearRotateTimer(): void {
    if (this.rotateTimer) {
      clearTimeout(this.rotateTimer);
      this.rotateTimer = null;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.clearRotateTimer();
    // If a stream init is in flight, wait for it to settle — the awaited init
    // checks `this.closed` and cleans up any client/stream it created. We
    // intentionally swallow the init error here; it's already been logged on
    // the pushAudio() path, and close() must always succeed.
    if (this.pendingInit) {
      await this.pendingInit.catch(() => {});
    }
    try {
      this.stream?.end();
    } catch {
      // Already ended.
    }
    this.stream = null;
    try {
      await this.client?.close();
    } catch {
      // Ignore close errors.
    }
    this.client = null;
  }
}

export function createGoogleStreamingTranscriber(
  _participantIdentity: string,
  languageCode: string,
  options?: GoogleStreamingTranscriberOptions
): AudioTranscriber {
  return new GoogleStreamingTranscriber(languageCode, options);
}
