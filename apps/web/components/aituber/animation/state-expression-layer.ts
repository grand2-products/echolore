import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

/**
 * Applies expressions based on avatar state (thinking, etc.).
 * Replaces the old useEffect-based state expression logic.
 */
export class StateExpressionLayer implements AnimationLayer {
  update(_delta: number, context: AnimationContext): LayerOutput {
    if (context.avatarState === "thinking") {
      return {
        expressions: { happy: 0.3 },
      };
    }
    return {};
  }

  reset(): void {
    // Stateless
  }
}
