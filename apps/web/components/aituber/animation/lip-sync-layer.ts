import type { AnimationContext, AnimationLayer, LayerOutput, VisemeEntry } from "./types";

const VISEME_MAP: Record<string, Record<string, number>> = {
  viseme_aa: { aa: 1.0 },
  viseme_I: { ih: 0.8, ee: 0.3 },
  viseme_U: { ou: 0.9 },
  viseme_E: { ee: 0.8, ih: 0.2 },
  viseme_O: { oh: 0.9 },
  viseme_nn: { ou: 0.2 },
  viseme_kk: { ih: 0.3 },
  viseme_SS: { ih: 0.4, ee: 0.2 },
  viseme_FF: { ih: 0.2, ou: 0.1 },
  viseme_TH: { ee: 0.2, ih: 0.2 },
  viseme_PP: {},
  viseme_CH: { ih: 0.3, ee: 0.1 },
  viseme_RR: { oh: 0.3, aa: 0.2 },
  viseme_sil: {},
};

const SMOOTHING_ALPHA = 0.25;
const THRESHOLD = 0.05;

export class LipSyncLayer implements AnimationLayer {
  private playbackStartTime = 0;
  private activeVisemes: VisemeEntry[] | null = null;
  private smoothed: Record<string, number> = {};

  update(delta: number, context: AnimationContext): LayerOutput {
    if (context.avatarState !== "talking") {
      return this.decayAll(delta);
    }

    if (context.visemes && context.visemes !== this.activeVisemes) {
      this.activeVisemes = context.visemes;
      this.playbackStartTime = performance.now();
    }

    if (this.activeVisemes && this.activeVisemes.length > 0) {
      return this.visemeMode(delta);
    }

    return this.audioFallback(delta, context);
  }

  private visemeMode(delta: number): LayerOutput {
    const elapsed = (performance.now() - this.playbackStartTime) / 1000;
    const viseme = this.findCurrentViseme(elapsed);
    const raw = viseme ? (VISEME_MAP[viseme] ?? {}) : {};
    return this.smoothAndReturn(raw, delta);
  }

  private findCurrentViseme(elapsed: number): string | null {
    const visemes = this.activeVisemes;
    if (!visemes || visemes.length === 0) return null;

    let current: string | null = null;
    for (const v of visemes) {
      if (v.time <= elapsed) {
        current = v.viseme;
      } else {
        break;
      }
    }
    return current;
  }

  private audioFallback(delta: number, context: AnimationContext): LayerOutput {
    if (!context.audioAnalyser) return this.decayAll(delta);

    const analyser = context.audioAnalyser;
    const fftSize = analyser.fftSize || 256;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    const hzPerBin = context.audioSampleRate / fftSize;

    const bandEnergy = (lo: number, hi: number): number => {
      const startBin = Math.max(0, Math.round(lo / hzPerBin));
      const endBin = Math.min(data.length - 1, Math.round(hi / hzPerBin));
      if (startBin > endBin) return 0;
      let sum = 0;
      for (let i = startBin; i <= endBin; i++) sum += data[i]!;
      return sum / ((endBin - startBin + 1) * 255);
    };

    const low = bandEnergy(200, 500);
    const midLow = bandEnergy(500, 900);
    const mid = bandEnergy(700, 1500);
    const high = bandEnergy(1500, 2500);

    const raw: Record<string, number> = {
      aa: midLow * 0.6 + mid * 0.4,
      ih: low * 0.3 + high * 0.7,
      ou: low * 0.7 + (1 - mid) * 0.3 * low,
      ee: midLow * 0.3 + high * 0.7,
      oh: midLow * 0.5 + (1 - high) * 0.3 * midLow,
    };

    return this.smoothAndReturn(raw, delta);
  }

  private smoothAndReturn(raw: Record<string, number>, _delta: number): LayerOutput {
    const expressions: Record<string, number> = {};
    const allKeys = new Set([...Object.keys(raw), ...Object.keys(this.smoothed)]);

    for (const key of allKeys) {
      const target = raw[key] ?? 0;
      const prev = this.smoothed[key] ?? 0;
      const val = prev + SMOOTHING_ALPHA * (target - prev);
      this.smoothed[key] = val;
      if (val > THRESHOLD) {
        expressions[key] = val;
      }
    }

    return { expressions };
  }

  private decayAll(delta: number): LayerOutput {
    const expressions: Record<string, number> = {};
    let hasValues = false;
    for (const [key, val] of Object.entries(this.smoothed)) {
      const decayed = val * Math.exp(-8 * delta);
      if (decayed > THRESHOLD) {
        this.smoothed[key] = decayed;
        expressions[key] = decayed;
        hasValues = true;
      } else {
        this.smoothed[key] = 0;
      }
    }
    if (!hasValues) this.activeVisemes = null;
    return { expressions };
  }

  reset(): void {
    this.playbackStartTime = 0;
    this.activeVisemes = null;
    this.smoothed = {};
  }
}
