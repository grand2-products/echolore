import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const speechClientCloseMock = vi.fn().mockResolvedValue(undefined);
const speechClientCtor = vi.fn();
const streamingRecognizeMock = vi.fn();

class FakeStream extends EventEmitter {
  written: unknown[] = [];
  endCalled = false;
  write(payload: unknown) {
    this.written.push(payload);
    return true;
  }
  end() {
    this.endCalled = true;
    this.emit("end");
  }
}

function newFakeStream(): FakeStream {
  return new FakeStream();
}

vi.mock("@google-cloud/speech", () => ({
  SpeechClient: class {
    constructor() {
      speechClientCtor();
    }
    streamingRecognize() {
      return streamingRecognizeMock();
    }
    close() {
      return speechClientCloseMock();
    }
  },
}));

const { createGoogleStreamingTranscriber } = await import("./google-stt-transcriber.js");

describe("GoogleStreamingTranscriber", () => {
  beforeEach(() => {
    speechClientCtor.mockClear();
    speechClientCloseMock.mockClear();
    streamingRecognizeMock.mockReset();
  });

  it("opens a stream and forwards interim + final transcripts", async () => {
    const stream = newFakeStream();
    streamingRecognizeMock.mockReturnValue(stream);
    const t = createGoogleStreamingTranscriber("p1", "ja-JP");
    const results: { text: string; isFinal: boolean }[] = [];
    t.onResult((r) => results.push({ text: r.text, isFinal: r.isFinal }));

    t.pushAudio({ participantIdentity: "p1", samples: new Int16Array(10), sampleRate: 16_000 });
    // ensureStream() is async — let the dynamic-import promise resolve.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    stream.emit("data", {
      results: [{ isFinal: false, alternatives: [{ transcript: "hello" }] }],
    });
    stream.emit("data", {
      results: [{ isFinal: true, alternatives: [{ transcript: "hello world" }] }],
    });

    expect(results).toEqual([
      { text: "hello", isFinal: false },
      { text: "hello world", isFinal: true },
    ]);
    expect(stream.written[0]).toMatchObject({
      streamingConfig: expect.objectContaining({
        config: expect.objectContaining({ languageCode: "ja-JP" }),
      }),
    });
  });

  it("close() during in-flight init resolves without leaking a stream", async () => {
    const stream = newFakeStream();
    streamingRecognizeMock.mockReturnValue(stream);

    const t = createGoogleStreamingTranscriber("p1", "ja-JP");
    // Kick off init — pendingInit is set inside ensureStream(). close races
    // with the awaited dynamic import; the awaited path inside ensureStream
    // re-checks `closed` after import and skips client construction (or
    // closes it if it was already constructed).
    t.pushAudio({ participantIdentity: "p1", samples: new Int16Array(10), sampleRate: 16_000 });
    // Don't `await` between pushAudio and close — that's the race we want.
    const closing = t.close();
    await closing;

    // The race-safe outcomes are: (a) init aborted before creating the
    // client (no stream opened), or (b) client created and then closed.
    // Either way, no stream may be left open: it must either never have
    // been opened, or it must have been ended.
    if (streamingRecognizeMock.mock.calls.length > 0) {
      expect(stream.endCalled).toBe(true);
      expect(speechClientCloseMock).toHaveBeenCalled();
    } else {
      expect(speechClientCtor).not.toHaveBeenCalled();
    }
  });

  it("ignores data events from a stream after close()", async () => {
    const stream = newFakeStream();
    streamingRecognizeMock.mockReturnValue(stream);
    const t = createGoogleStreamingTranscriber("p1", "ja-JP");
    const results: unknown[] = [];
    t.onResult((r) => results.push(r));

    t.pushAudio({ participantIdentity: "p1", samples: new Int16Array(10), sampleRate: 16_000 });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    await t.close();
    stream.emit("data", {
      results: [{ isFinal: true, alternatives: [{ transcript: "late" }] }],
    });
    expect(results).toHaveLength(0);
  });

  it("rotates the underlying stream before the 5-minute cap", async () => {
    vi.useFakeTimers();
    try {
      const streams = [newFakeStream(), newFakeStream(), newFakeStream()];
      let i = 0;
      streamingRecognizeMock.mockImplementation(() => {
        const s = streams[i] ?? newFakeStream();
        i += 1;
        return s;
      });

      const t = createGoogleStreamingTranscriber("p1", "ja-JP", { rotateAfterMs: 60_000 });
      t.pushAudio({ participantIdentity: "p1", samples: new Int16Array(10), sampleRate: 16_000 });
      // Resolve the dynamic import and complete openStream() before advancing.
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      // Advance just past the rotation deadline: exactly one rotation fires.
      await vi.advanceTimersByTimeAsync(60_000);

      expect(streams[0].endCalled).toBe(true);
      expect(streamingRecognizeMock).toHaveBeenCalledTimes(2);

      await t.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
