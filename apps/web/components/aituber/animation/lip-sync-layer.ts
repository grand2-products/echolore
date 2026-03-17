import type { AnimationContext, AnimationLayer, LayerOutput, VisemeEntry } from "./types";

const SMOOTHING_ALPHA = 0.25;
const THRESHOLD = 0.05;

// ARKit viseme → VRM expression mapping
const VISEME_MAP: Record<string, Record<string, number>> = {
  viseme_aa: { aa: 1.0 },
  viseme_I: { ih: 0.8, ee: 0.3 },
  viseme_U: { ou: 0.9 },
  viseme_E: { ee: 0.8, ih: 0.2 },
  viseme_O: { oh: 0.9 },
  viseme_nn: { ou: 0.2 },
  viseme_kk: { ih: 0.3 },
  viseme_SS: { ih: 0.4, ee: 0.2 },
  viseme_FF: { ih: 0.2 },
  viseme_TH: { ih: 0.3, ee: 0.1 },
  viseme_PP: {},
  viseme_DD: { aa: 0.2 },
  viseme_RR: { oh: 0.3 },
  viseme_CH: { ih: 0.4 },
  viseme_sil: {},
};

const VOWEL_NAMES = ["aa", "ih", "ou", "ee", "oh"] as const;

export class LipSyncLayer implements AnimationLayer {
  private smoothed: Record<string, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private visemePlaybackStart = 0;
  private activeVisemes: VisemeEntry[] | null = null;
  private bands: Record<string, [number, number]> | null = null;

  update(_delta: number, context: AnimationContext): LayerOutput {
    if (context.avatarState !== "talking") {
      return this.decayAll();
    }

    // Layer 1: TTS viseme timestamps (SOTA)
    if (context.visemes && context.visemes.length > 0) {
      if (context.visemes !== this.activeVisemes) {
        this.activeVisemes = context.visemes;
        this.visemePlaybackStart = context.elapsedTime;
      }
      return this.updateFromVisemes(context);
    }

    // Layer 2: Audio fallback
    if (context.audioAnalyser) {
      return this.updateFromAudio(context);
    }

    return this.decayAll();
  }

  private updateFromVisemes(context: AnimationContext): LayerOutput {
    if (!this.activeVisemes) return this.decayAll();

    const elapsed = context.elapsedTime - this.visemePlaybackStart;
    const viseme = this.findCurrentViseme(elapsed);
    const target = viseme ? (VISEME_MAP[viseme] ?? {}) : {};

    for (const key of VOWEL_NAMES) {
      const t = target[key] ?? 0;
      const s = this.smoothed[key] ?? 0;
      this.smoothed[key] = s + (t - s) * SMOOTHING_ALPHA;
    }

    return { expressions: { ...this.smoothed } };
  }

  private findCurrentViseme(elapsed: number): string | null {
    if (!this.activeVisemes || this.activeVisemes.length === 0) return null;

    let current: string | null = null;
    for (const entry of this.activeVisemes) {
      if (entry.time <= elapsed) {
        current = entry.viseme;
      } else {
        break;
      }
    }
    return current;
  }

  private updateFromAudio(context: AnimationContext): LayerOutput {
    const analyser = context.audioAnalyser;
    if (!analyser) return this.decayAll();

    if (!this.dataArray || this.dataArray.length !== analyser.frequencyBinCount) {
      this.dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }
    analyser.getByteFrequencyData(this.dataArray);

    // Compute bin ranges dynamically from sample rate
    if (!this.bands) {
      this.computeBands(context.audioSampleRate || 48000, analyser.fftSize || 256);
    }

    const bands = this.bands;
    if (!bands) return this.decayAll();

    // Band energy ratios for vowel estimation
    const bandEnergy: Record<string, number> = {};
    for (const [name, [start, end]] of Object.entries(bands)) {
      let sum = 0;
      let count = 0;
      for (let i = start; i <= end && i < this.dataArray.length; i++) {
        sum += this.dataArray[i] ?? 0;
        count++;
      }
      bandEnergy[name] = count > 0 ? sum / count / 255 : 0;
    }

    const low = bandEnergy.low ?? 0;
    const midLow = bandEnergy.midLow ?? 0;
    const mid = bandEnergy.mid ?? 0;
    const high = bandEnergy.high ?? 0;

    // Vowel estimation from band energy ratios
    const raw: Record<string, number> = {
      aa: midLow * 0.6 + mid * 0.4,
      ih: low * 0.3 + high * 0.7,
      ou: low * 0.7 + (1 - mid) * 0.3 * low,
      ee: midLow * 0.3 + high * 0.7,
      oh: midLow * 0.5 + (1 - high) * 0.3 * midLow,
    };

    // Threshold and dominant selection
    let maxVal = 0;
    let dominant = "aa";
    for (const [vowel, val] of Object.entries(raw)) {
      const v = val < THRESHOLD ? 0 : val;
      raw[vowel] = v;
      if (v > maxVal) {
        maxVal = v;
        dominant = vowel;
      }
    }

    // EMA smoothing
    for (const key of VOWEL_NAMES) {
      const t = key === dominant ? (raw[key] ?? 0) : (raw[key] ?? 0) * 0.3;
      const s = this.smoothed[key] ?? 0;
      this.smoothed[key] = s + (t - s) * SMOOTHING_ALPHA;
    }

    return { expressions: { ...this.smoothed } };
  }

  private computeBands(sampleRate: number, fftSize: number): void {
    const hzPerBin = sampleRate / fftSize;
    this.bands = {
      low: [Math.round(200 / hzPerBin), Math.round(500 / hzPerBin)],
      midLow: [Math.round(500 / hzPerBin), Math.round(900 / hzPerBin)],
      mid: [Math.round(700 / hzPerBin), Math.round(1500 / hzPerBin)],
      high: [Math.round(1500 / hzPerBin), Math.round(2500 / hzPerBin)],
    };
  }

  private decayAll(): LayerOutput {
    for (const key of VOWEL_NAMES) {
      this.smoothed[key] = (this.smoothed[key] ?? 0) * (1 - SMOOTHING_ALPHA);
      if ((this.smoothed[key] ?? 0) < 0.01) this.smoothed[key] = 0;
    }
    return { expressions: { ...this.smoothed } };
  }

  reset(): void {
    for (const key of VOWEL_NAMES) {
      this.smoothed[key] = 0;
    }
    this.dataArray = null;
    this.activeVisemes = null;
    this.bands = null;
  }
}
