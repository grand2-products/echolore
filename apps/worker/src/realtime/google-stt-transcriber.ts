import type { protos, SpeechClient } from "@google-cloud/speech";
import type { AudioChunk, AudioTranscriber, TranscriptResult } from "./types.js";

type StreamingRecognizeStream = ReturnType<SpeechClient["streamingRecognize"]>;
type StreamingResponse = protos.google.cloud.speech.v1.IStreamingRecognizeResponse;

// Audio arrives from the RTC source resampled to 16 kHz mono LINEAR16.
const STT_SAMPLE_RATE = 16_000;

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
  private starting: Promise<void> | null = null;
  private resultHandler: ((result: TranscriptResult) => void) | null = null;
  private closed = false;

  constructor(private readonly languageCode: string) {}

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
        console.error("[realtime] STT write failed", err);
      });
  }

  private ensureStream(): Promise<void> {
    if (this.stream) return Promise.resolve();
    if (this.starting) return this.starting;

    this.starting = (async () => {
      const speech = await import("@google-cloud/speech");
      const client = new speech.SpeechClient();
      this.client = client;

      const stream = client.streamingRecognize();
      stream.on("data", (response: StreamingResponse) => {
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
      stream.on("error", (err: Error) => {
        console.error("[realtime] STT stream error", err);
      });

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
    })();

    return this.starting;
  }

  async close(): Promise<void> {
    this.closed = true;
    try {
      this.stream?.end();
    } catch {
      // already ended
    }
    this.stream = null;
    try {
      await this.client?.close();
    } catch {
      // ignore close errors
    }
    this.client = null;
  }
}

export function createGoogleStreamingTranscriber(
  _participantIdentity: string,
  languageCode: string
): AudioTranscriber {
  return new GoogleStreamingTranscriber(languageCode);
}
