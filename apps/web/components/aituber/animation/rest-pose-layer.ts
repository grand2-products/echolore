import type { AnimationLayer, LayerOutput } from "./types";

/**
 * Applies a natural standing pose to override the default VRM T-pose.
 * Rotates upper/lower arms down to sides with a slight elbow bend.
 * This layer provides the base pose that other layers add on top of.
 */
export class RestPoseLayer implements AnimationLayer {
  private static readonly POSE: LayerOutput = {
    boneRotations: {
      leftUpperArm: { x: 0, y: 0, z: -1.15 },
      rightUpperArm: { x: 0, y: 0, z: 1.15 },
      leftLowerArm: { x: 0, y: 0, z: -0.12 },
      rightLowerArm: { x: 0, y: 0, z: 0.12 },
    },
  };

  update(): LayerOutput {
    return RestPoseLayer.POSE;
  }

  reset(): void {
    // Stateless
  }
}
