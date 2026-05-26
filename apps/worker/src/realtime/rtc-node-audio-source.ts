import type { RoomAudioSource } from "./types.js";

export interface RtcNodeAudioSourceOptions {
  roomName: string;
  meetingId: string;
  livekitHost: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  /** Identity the worker joins as. Should be hidden from the participant list. */
  identity?: string;
}

/**
 * Concrete `RoomAudioSource` backed by the native @livekit/rtc-node client.
 *
 * RUNTIME-VERIFICATION BOUNDARY (G3)
 * ----------------------------------
 * Subscribing to participant media requires @livekit/rtc-node, a native module
 * that cannot be exercised in CI / this environment. It is intentionally not yet
 * a dependency. The intended implementation:
 *
 *   1. Mint a worker token (roomJoin + canSubscribe, hidden=true) for identity
 *      `worker-{meetingId}` using livekit-server-sdk AccessToken.
 *   2. const room = new Room();
 *      await room.connect(livekitHost, token, { autoSubscribe: true });
 *   3. room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
 *        if (track.kind !== TrackKind.KIND_AUDIO) return;
 *        const stream = new AudioStream(track);
 *        (async () => {
 *          for await (const frame of stream) {
 *            handler({ participantIdentity: participant.identity,
 *                      samples: new Int16Array(frame.data.buffer),
 *                      sampleRate: frame.sampleRate });
 *          }
 *        })();
 *      });
 *   4. room.on(RoomEvent.ParticipantDisconnected, p => leftHandler(p.identity));
 *   5. disconnect(): await room.disconnect();
 *
 * Until @livekit/rtc-node is installed and verified against a live LiveKit
 * server, this factory throws so a misconfiguration is loud, not silent.
 */
export function createRtcNodeAudioSource(_options: RtcNodeAudioSourceOptions): RoomAudioSource {
  throw new Error(
    "createRtcNodeAudioSource is not yet wired: install @livekit/rtc-node and implement room " +
      "media subscription (see rtc-node-audio-source.ts for the intended flow)."
  );
}
