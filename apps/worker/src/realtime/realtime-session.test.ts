import { describe, expect, it, vi } from "vitest";
import { RealtimeTranscriptionSession } from "./realtime-session.js";
import type {
  AudioChunk,
  AudioTranscriber,
  RoomAudioSource,
  SegmentSink,
  TranscriptResult,
} from "./types.js";

const FIXED_NOW = new Date("2026-05-26T12:00:00.000Z");
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Captures the handlers the session registers and lets a test drive the source. */
class FakeSource implements RoomAudioSource {
  audioHandler: ((chunk: AudioChunk) => void) | null = null;
  leftHandler: ((participantIdentity: string) => void) | null = null;
  connect = vi.fn(async () => {});
  disconnect = vi.fn(async () => {});

  onAudioChunk(handler: (chunk: AudioChunk) => void) {
    this.audioHandler = handler;
  }
  onParticipantLeft(handler: (participantIdentity: string) => void) {
    this.leftHandler = handler;
  }

  emitChunk(participantIdentity: string) {
    this.audioHandler?.({ participantIdentity, samples: new Int16Array(160), sampleRate: 16_000 });
  }
  emitLeft(participantIdentity: string) {
    this.leftHandler?.(participantIdentity);
  }
}

class FakeTranscriber implements AudioTranscriber {
  private handler: ((result: TranscriptResult) => void) | null = null;
  pushAudio = vi.fn<(chunk: AudioChunk) => void>();
  close = vi.fn(async () => {});

  onResult(handler: (result: TranscriptResult) => void) {
    this.handler = handler;
  }
  emit(result: TranscriptResult) {
    this.handler?.(result);
  }
}

function setup(sessionId = "S") {
  const source = new FakeSource();
  const transcribers = new Map<string, FakeTranscriber>();
  const submitted: Parameters<SegmentSink["submit"]>[0][] = [];
  const sink: SegmentSink = {
    submit: vi.fn(async (segment) => {
      submitted.push(segment);
    }),
  };
  const session = new RealtimeTranscriptionSession({
    meetingId: "m1",
    languageCode: "ja-JP",
    source,
    sink,
    sessionId,
    createTranscriber: (participantIdentity) => {
      const t = new FakeTranscriber();
      transcribers.set(participantIdentity, t);
      return t;
    },
    now: () => FIXED_NOW,
  });
  return { source, transcribers, submitted, session };
}

describe("RealtimeTranscriptionSession", () => {
  it("connects the source and feeds chunks to a per-participant transcriber", async () => {
    const { source, transcribers, session } = setup();
    await session.start();
    expect(source.connect).toHaveBeenCalledOnce();

    source.emitChunk("p1");
    expect(transcribers.get("p1")?.pushAudio).toHaveBeenCalledOnce();
  });

  it("submits partial then final under one segmentKey, then advances the utterance", async () => {
    const { source, transcribers, submitted, session } = setup("S");
    await session.start();
    source.emitChunk("p1");
    const t = transcribers.get("p1");

    t?.emit({ text: "hello", isFinal: false });
    t?.emit({ text: "hello world", isFinal: true });
    t?.emit({ text: "next", isFinal: false });
    await flush();

    expect(submitted).toHaveLength(3);
    // sessionId is mixed into the key; partial+final of one utterance share it.
    expect(submitted[0]).toMatchObject({
      participantIdentity: "p1",
      content: "hello",
      isPartial: true,
      segmentKey: "p1-S-0",
      finalizedAt: null,
    });
    expect(submitted[1]).toMatchObject({
      content: "hello world",
      isPartial: false,
      segmentKey: "p1-S-0",
      finalizedAt: FIXED_NOW.toISOString(),
    });
    // After a final result the next utterance gets a fresh index.
    expect(submitted[2]).toMatchObject({ segmentKey: "p1-S-1", isPartial: true });
  });

  it("ignores blank transcripts", async () => {
    const { source, transcribers, submitted, session } = setup();
    await session.start();
    source.emitChunk("p1");
    transcribers.get("p1")?.emit({ text: "   ", isFinal: true });
    await flush();
    expect(submitted).toHaveLength(0);
  });

  it("closes a participant's transcriber when they leave", async () => {
    const { source, transcribers, session } = setup();
    await session.start();
    source.emitChunk("p1");
    const t = transcribers.get("p1");

    source.emitLeft("p1");
    await flush();
    expect(t?.close).toHaveBeenCalledOnce();
  });

  it("stops by closing transcribers and disconnecting the source", async () => {
    const { source, transcribers, session } = setup();
    await session.start();
    source.emitChunk("p1");
    const t = transcribers.get("p1");

    await session.stop();
    expect(t?.close).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
  });

  it("does not submit results that arrive after stop", async () => {
    const { source, transcribers, submitted, session } = setup();
    await session.start();
    source.emitChunk("p1");
    const t = transcribers.get("p1");

    await session.stop();
    t?.emit({ text: "late", isFinal: true });
    await flush();
    expect(submitted).toHaveLength(0);
  });
});
