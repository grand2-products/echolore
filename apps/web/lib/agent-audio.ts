import { LocalAudioTrack, type Room, Track } from "livekit-client";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Publish synthesized agent speech into the LiveKit room on behalf of the
 * agent's bot participant, so every participant hears it through their normal
 * remote-audio rendering (RoomAudioRenderer) rather than a local <audio> tag
 * that only the requesting user can hear.
 *
 * The TTS audio (base64) is decoded with the Web Audio API, routed into a
 * MediaStreamAudioDestinationNode, and published as the bot's audio track. The
 * track is unpublished automatically once playback finishes. Must be invoked
 * from a user gesture so the AudioContext is allowed to start.
 */
export async function publishAgentSpeech(
  room: Room,
  audio: { mimeType: string; base64: string }
): Promise<void> {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("Web Audio API is not available");
  }

  const context = new AudioContextCtor();
  let localTrack: LocalAudioTrack | null = null;
  try {
    const audioBuffer = await context.decodeAudioData(base64ToArrayBuffer(audio.base64));
    const destination = context.createMediaStreamDestination();
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(destination);

    const [mediaStreamTrack] = destination.stream.getAudioTracks();
    if (!mediaStreamTrack) {
      throw new Error("Failed to derive an audio track from TTS output");
    }

    localTrack = new LocalAudioTrack(mediaStreamTrack, undefined, true, context);
    await room.localParticipant.publishTrack(localTrack, {
      source: Track.Source.Microphone,
      name: "agent-speech",
    });

    // AudioContext may start suspended; resume so samples flow into the stream.
    await context.resume();

    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  } finally {
    if (localTrack) {
      try {
        await room.localParticipant.unpublishTrack(localTrack);
      } catch {
        // ignore teardown errors
      }
      localTrack.stop();
    }
    await context.close().catch(() => {});
  }
}
