import type { AituberAvatarState, VisemeEntry } from "@echolore/shared/contracts";

export type { AituberAvatarState, VisemeEntry };

export type EmotionType = "neutral" | "happy" | "sad" | "angry" | "surprised" | "relaxed";

export interface EmotionState {
  type: EmotionType;
  intensity: number;
}

export interface AnimationContext {
  avatarState: AituberAvatarState;
  audioAnalyser: AnalyserNode | null;
  audioSampleRate: number;
  emotion: EmotionState | null;
  elapsedTime: number;
  visemes: VisemeEntry[] | null;
  action: string | null;
}

export interface LayerOutput {
  expressions?: Partial<Record<string, number>>;
  boneRotations?: Partial<Record<string, { x: number; y: number; z: number }>>;
  lockedBones?: Set<string>;
}

export interface AnimationLayer {
  update(delta: number, context: AnimationContext): LayerOutput;
  reset(): void;
}
