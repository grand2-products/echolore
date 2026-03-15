import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Since the web vitest environment is "node" (no DOM / jsdom), we cannot use
 * renderHook from @testing-library/react.  Instead we mock React hooks and
 * the LiveKit data-channel hook so we can exercise the send / receive /
 * rate-limit logic directly.
 */

const { sendMock, useDataChannelMock } = vi.hoisted(() => {
  const sendMock = vi.fn();
  const useDataChannelMock = vi.fn();
  return { sendMock, useDataChannelMock };
});

// Capture state setters and effect callbacks registered during hook execution
let stateValue: unknown[] = [];
let setStateCallback: ((updater: (prev: unknown[]) => unknown[]) => void) | null = null;
const effectCleanupHolder: { ref: (() => void) | undefined } = { ref: undefined };
let lastSendRefValue: { current: number };
let encoderRefValue: { current: TextEncoder };
let decoderRefValue: { current: TextDecoder };

const refIndex = { current: 0 };

vi.mock("react", () => ({
  useState: (init: unknown) => {
    stateValue = init as unknown[];
    setStateCallback = (updater: (prev: unknown[]) => unknown[]) => {
      if (typeof updater === "function") {
        stateValue = updater(stateValue as unknown[]);
      } else {
        stateValue = updater;
      }
    };
    return [stateValue, setStateCallback];
  },
  useCallback: (fn: (...args: unknown[]) => unknown) => fn,
  useRef: (init: unknown) => {
    const idx = refIndex.current++;
    if (idx === 0) {
      encoderRefValue = { current: init as TextEncoder };
      return encoderRefValue;
    }
    if (idx === 1) {
      decoderRefValue = { current: init as TextDecoder };
      return decoderRefValue;
    }
    lastSendRefValue = { current: init as number };
    return lastSendRefValue;
  },
  useEffect: (fn: () => (() => void) | undefined) => {
    const cleanup = fn();
    if (cleanup) effectCleanupHolder.ref = cleanup;
  },
}));

vi.mock("@livekit/components-react", () => ({
  useDataChannel: useDataChannelMock,
}));

describe("useReactions", () => {
  let onMessageHandler: ((msg: { payload: Uint8Array }) => void) | null;
  const encoder = new TextEncoder();

  beforeEach(() => {
    onMessageHandler = null;
    refIndex.current = 0;
    stateValue = [];

    useDataChannelMock.mockImplementation(
      (_topic: string, onMessage: (msg: { payload: Uint8Array }) => void) => {
        onMessageHandler = onMessage;
        return { send: sendMock };
      }
    );

    sendMock.mockReset();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "test-uuid" as `${string}-${string}-${string}-${string}-${string}`
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function getHook() {
    // Reset module to re-run hook with fresh mocks
    vi.resetModules();
    refIndex.current = 0;
    stateValue = [];
    const { useReactions: createReactions } = await import("./use-reactions.js");
    return createReactions("Alice");
  }

  it("sends a reaction with correct JSON payload", async () => {
    const { sendReaction } = await getHook();

    sendReaction("thumbsUp");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]?.[0] as Uint8Array;
    const decoded = JSON.parse(new TextDecoder().decode(payload));
    expect(decoded).toEqual(
      expect.objectContaining({
        id: "test-uuid",
        emoji: "thumbsUp",
        senderName: "Alice",
        ts: expect.any(Number),
      })
    );
    expect(sendMock).toHaveBeenCalledWith(expect.any(Uint8Array), {
      reliable: false,
    });
  });

  it("rate limits reactions within 300ms", async () => {
    const now = 1000;
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(now) // first send
      .mockReturnValueOnce(now + 100) // second send (within 300ms)
      .mockReturnValueOnce(now + 400); // third send (after 300ms)

    const { sendReaction } = await getHook();

    sendReaction("heart");
    expect(sendMock).toHaveBeenCalledTimes(1);

    sendReaction("heart");
    // Should be rate-limited
    expect(sendMock).toHaveBeenCalledTimes(1);

    sendReaction("heart");
    // Should go through after 300ms
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("receiving a reaction adds to active reactions list", async () => {
    await getHook();

    const message = {
      id: "remote-uuid",
      emoji: "clap",
      senderName: "Dave",
      ts: Date.now(),
    };

    onMessageHandler?.({
      payload: encoder.encode(JSON.stringify(message)),
    });

    const reactions = stateValue as Array<{ id: string; emoji: string }>;
    expect(reactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "remote-uuid",
          emoji: "clap",
        }),
      ])
    );
  });

  it("removeReaction filters out the reaction by id", async () => {
    const { sendReaction, removeReaction } = await getHook();

    sendReaction("fire");
    const reactionsAfterSend = stateValue as Array<{ id: string }>;
    expect(reactionsAfterSend.length).toBe(1);

    const reactionId = reactionsAfterSend[0]?.id ?? "";
    removeReaction(reactionId);

    const reactionsAfterRemove = stateValue as Array<{ id: string }>;
    expect(reactionsAfterRemove.length).toBe(0);
  });

  it("exports REACTION_EMOJIS with expected entries", async () => {
    vi.resetModules();
    const mod = await import("./use-reactions.js");

    expect(mod.REACTION_EMOJIS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "thumbsUp" }),
        expect.objectContaining({ label: "heart" }),
        expect.objectContaining({ label: "fire" }),
      ])
    );
    expect(mod.REACTION_EMOJIS.length).toBe(8);
  });
});
