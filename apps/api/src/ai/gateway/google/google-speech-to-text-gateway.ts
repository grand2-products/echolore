import { SpeechClient } from "@google-cloud/speech";
import type {
  SpeechProvider,
  SpeechToTextGateway,
  SpeechToTextRequest,
  SpeechToTextResult,
} from "../types.js";

export class GoogleSpeechToTextGateway implements SpeechToTextGateway {
  readonly provider: SpeechProvider = "google";

  constructor(private readonly client = new SpeechClient()) {}

  async transcribe(input: SpeechToTextRequest): Promise<SpeechToTextResult> {
    const [response] = await this.client.recognize({
      config: {
        encoding: "WEBM_OPUS",
        languageCode: input.languageCode,
        model: "latest_long",
        sampleRateHertz: input.sampleRateHertz,
      },
      audio: {
        content: input.audio.toString("base64"),
      },
    });

    const transcript =
      response.results
        ?.flatMap((result) => result.alternatives ?? [])
        .map((alternative) => alternative.transcript ?? "")
        .join(" ")
        .trim() ?? "";
    const confidence = response.results?.[0]?.alternatives?.[0]?.confidence ?? undefined;

    return {
      provider: this.provider,
      transcript,
      confidence,
      isPartial: false,
      raw: {
        resultCount: response.results?.length ?? 0,
        mimeType: input.mimeType,
        participantIdentity: input.participantIdentity ?? null,
        segmentKey: input.segmentKey ?? null,
      },
    };
  }
}
