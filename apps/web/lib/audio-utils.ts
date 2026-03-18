/**
 * Shared audio utilities for TTS playback.
 * Used by AituberStage (live session) and CharacterPreview (management).
 */

export interface AudioNodes {
  context: AudioContext;
  analyser: AnalyserNode;
}

/**
 * Lazily initializes an AudioContext + AnalyserNode pair.
 * Returns existing nodes if already initialized.
 */
export function ensureAudioNodes(existing: AudioNodes | null): AudioNodes {
  if (existing) return existing;
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  return { context, analyser };
}

/**
 * Decodes a base64-encoded audio string into an AudioBuffer.
 */
export async function decodeBase64Audio(
  ctx: AudioContext,
  base64Audio: string
): Promise<AudioBuffer> {
  const raw = atob(base64Audio);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return ctx.decodeAudioData(bytes.buffer);
}

/**
 * Plays an AudioBuffer through the analyser → destination chain.
 * Returns the source node for caller to attach onended, etc.
 */
export function playAudioBuffer(nodes: AudioNodes, buffer: AudioBuffer): AudioBufferSourceNode {
  const source = nodes.context.createBufferSource();
  source.buffer = buffer;
  source.connect(nodes.analyser);
  nodes.analyser.connect(nodes.context.destination);
  source.start();
  return source;
}
