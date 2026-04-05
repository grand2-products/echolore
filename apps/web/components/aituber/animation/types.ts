export type { VisemeEntry } from "@echolore/shared/contracts";

import type {
  AituberAvatarState,
  AituberEmotionType,
  VisemeEntry,
} from "@echolore/shared/contracts";

export type EmotionType = AituberEmotionType;

export interface EmotionState {
  type: EmotionType;
  intensity: number;
}

export interface AnimationContext {
  avatarState: AituberAvatarState;
  emotion: EmotionState | null;
  elapsedTime: number;
  visemes: VisemeEntry[] | null;
}

export interface LayerOutput {
  expressions?: Partial<Record<string, number>>;
  boneRotations?: Partial<Record<string, { x: number; y: number; z: number }>>;
}

export interface AnimationLayer {
  update(delta: number, context: AnimationContext): LayerOutput;
  reset(): void;
}
