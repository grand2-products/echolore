import type {
  SpeechProvider,
  TextToSpeechGateway,
  TextToSpeechRequest,
  TextToSpeechResult,
} from "../types.js";

const GEMINI_TTS_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";

type GeminiTtsResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
      }>;
    };
  }>;
};

export const GEMINI_TTS_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
] as const;

export type GeminiTtsVoice = (typeof GEMINI_TTS_VOICES)[number];

export interface GeminiTtsConfig {
  apiKey: string;
  model?: string;
  voiceName?: string;
}

export class GeminiTextToSpeechGateway implements TextToSpeechGateway {
  readonly provider: SpeechProvider = "gemini";
  private readonly config: GeminiTtsConfig;

  constructor(config: GeminiTtsConfig) {
    this.config = config;
  }

  async synthesize(input: TextToSpeechRequest): Promise<TextToSpeechResult> {
    const model = this.config.model || "gemini-2.5-flash-preview-tts";
    const voiceName = this.config.voiceName || input.voice || "Kore";
    const url = GEMINI_TTS_API_URL.replace("{model}", model);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.config.apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: input.text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Gemini TTS failed with status ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as GeminiTtsResponse;
    const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data?.trim();

    if (!audioData) {
      throw new Error("Gemini TTS returned empty audio");
    }

    const pcmBuffer = Buffer.from(audioData, "base64");
    const wavBuffer = pcmToWav(pcmBuffer);

    return {
      provider: this.provider,
      audio: wavBuffer,
      mimeType: "audio/wav",
      raw: {
        model,
        voiceName,
        languageCode: input.languageCode,
      },
    };
  }
}

function pcmToWav(pcm: Buffer, channels = 1, sampleRate = 24000, bitsPerSample = 16): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}
