export type { VisemeEntry } from "@echolore/shared/contracts";

export type EmotionType = "neutral" | "happy" | "sad" | "angry" | "surprised" | "relaxed";

export interface EmotionState {
  type: EmotionType;
  intensity: number;
}
