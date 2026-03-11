import type {
  SpeechProvider,
  TextToSpeechGateway,
  TextToSpeechRequest,
  TextToSpeechResult,
} from "../types.js";
import { getGoogleCloudAccessToken } from "./google-cloud-auth.js";

const GOOGLE_TTS_API_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

type GoogleTextToSpeechResponse = {
  audioContent?: string;
};

export class GoogleTextToSpeechGateway implements TextToSpeechGateway {
  readonly provider: SpeechProvider = "google";

  async synthesize(input: TextToSpeechRequest): Promise<TextToSpeechResult> {
    const accessToken = await getGoogleCloudAccessToken();
    const response = await fetch(GOOGLE_TTS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        input: {
          text: input.text,
        },
        voice: {
          languageCode: input.languageCode,
          name: input.voice || undefined,
        },
        audioConfig: {
          audioEncoding: "MP3",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Text-to-Speech failed with status ${response.status}`);
    }

    const data = (await response.json()) as GoogleTextToSpeechResponse;
    const audioContent = data.audioContent?.trim();
    if (!audioContent) {
      throw new Error("Google Text-to-Speech returned empty audio");
    }

    return {
      provider: this.provider,
      audio: Buffer.from(audioContent, "base64"),
      mimeType: "audio/mpeg",
      raw: {
        languageCode: input.languageCode,
        voice: input.voice ?? null,
      },
    };
  }
}
