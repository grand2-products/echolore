import type { AudioTranscriber } from "./types.js";

/**
 * Streaming `AudioTranscriber` backed by Google Cloud Speech-to-Text
 * (streamingRecognize).
 *
 * RUNTIME-VERIFICATION BOUNDARY (G3)
 * ----------------------------------
 * Requires @google-cloud/speech and a reachable STT endpoint, exercised only
 * with real audio. The intended implementation:
 *
 *   const client = new SpeechClient();
 *   const stream = client.streamingRecognize({
 *     config: { encoding: "LINEAR16", sampleRateHertz, languageCode,
 *               enableAutomaticPunctuation: true },
 *     interimResults: true,
 *   });
 *   // pushAudio(chunk) → stream.write({ audioContent: Buffer.from(chunk.samples.buffer) });
 *   // stream.on("data", d => {
 *   //   const r = d.results[0]; const alt = r?.alternatives?.[0];
 *   //   if (alt?.transcript) onResult({ text: alt.transcript,
 *   //     isFinal: Boolean(r.isFinal), confidence: alt.confidence ?? undefined });
 *   // });
 *   // close() → stream.end();
 *
 * Throws until wired so a misconfiguration is loud, not silent.
 */
export function createGoogleStreamingTranscriber(
  _participantIdentity: string,
  _languageCode: string
): AudioTranscriber {
  throw new Error(
    "createGoogleStreamingTranscriber is not yet wired: install @google-cloud/speech and " +
      "implement streamingRecognize (see google-stt-transcriber.ts for the intended flow)."
  );
}
