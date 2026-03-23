import type {
  SpeechProvider,
  TextToSpeechGateway,
  TextToSpeechRequest,
  TextToSpeechResult,
} from "../types.js";
import { getGoogleCloudAccessToken } from "./google-cloud-auth.js";

const GOOGLE_TTS_API_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const GOOGLE_TTS_VOICES_URL = "https://texttospeech.googleapis.com/v1/voices";

type GoogleTextToSpeechResponse = {
  audioContent?: string;
};

export interface GoogleTtsVoice {
  name: string;
  languageCodes: string[];
  ssmlGender: string;
  naturalSampleRateHertz: number;
}

export class GoogleTextToSpeechGateway implements TextToSpeechGateway {
  readonly provider: SpeechProvider = "google";

  async listVoices(languageCode?: string): Promise<GoogleTtsVoice[]> {
    let accessToken: string;
    try {
      accessToken = await getGoogleCloudAccessToken();
    } catch {
      return [];
    }

    const url = languageCode
      ? `${GOOGLE_TTS_VOICES_URL}?languageCode=${encodeURIComponent(languageCode)}`
      : GOOGLE_TTS_VOICES_URL;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Google TTS listVoices failed with status ${response.status}`);
    }

    const data = (await response.json()) as { voices?: GoogleTtsVoice[] };
    return data.voices ?? [];
  }

  async synthesize(input: TextToSpeechRequest): Promise<TextToSpeechResult> {
    let accessToken: string;
    try {
      accessToken = await getGoogleCloudAccessToken();
    } catch (err) {
      throw new Error(
        "Google Cloud credentials are not configured. Set GOOGLE_TTS_ACCESS_TOKEN or GOOGLE_CLOUD_ACCESS_TOKEN environment variable.",
        { cause: err }
      );
    }
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
