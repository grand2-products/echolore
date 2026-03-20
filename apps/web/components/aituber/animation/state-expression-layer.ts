import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

export class StateExpressionLayer implements AnimationLayer {
  update(_delta: number, context: AnimationContext): LayerOutput {
    if (context.avatarState === "thinking") {
      return { expressions: { happy: 0.3 } };
    }
    return {};
  }

  reset(): void {
    // stateless
  }
}
