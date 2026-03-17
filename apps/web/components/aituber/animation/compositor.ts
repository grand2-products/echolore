import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

const LERP_SPEED = 8;

// Face expressions use max-merge instead of additive to avoid conflicts
// between EmotionLayer and StateExpressionLayer
const FACE_EXPRESSIONS = new Set(["happy", "sad", "angry", "surprised", "relaxed", "neutral"]);

interface VrmInstance {
  expressionManager?: {
    getExpression: (name: string) => unknown | null;
    setValue: (name: string, value: number) => void;
  };
  humanoid?: {
    getNormalizedBoneNode: (name: string) => {
      rotation: { x: number; y: number; z: number; w: number };
      quaternion: { setFromEuler: (euler: unknown) => void };
    } | null;
  };
}

export class AnimationCompositor {
  private layers: AnimationLayer[] = [];
  private currentExpressions = new Map<string, number>();
  private currentBoneRotations = new Map<string, { x: number; y: number; z: number }>();
  private three: Record<string, unknown> | null = null;

  addLayer(layer: AnimationLayer): void {
    this.layers.push(layer);
  }

  removeLayer(layer: AnimationLayer): void {
    const idx = this.layers.indexOf(layer);
    if (idx >= 0) this.layers.splice(idx, 1);
  }

  setThree(three: Record<string, unknown>): void {
    this.three = three;
  }

  update(delta: number, context: AnimationContext, vrm: VrmInstance): void {
    // 1. Collect outputs from all layers
    const outputs: LayerOutput[] = [];
    for (const layer of this.layers) {
      outputs.push(layer.update(delta, context));
    }

    // Collect locked bones from motion clip layers
    const lockedBones = new Set<string>();
    for (const output of outputs) {
      if (output.lockedBones) {
        for (const bone of output.lockedBones) {
          lockedBones.add(bone);
        }
      }
    }

    // 2. Merge expressions: face group uses max, others use additive
    const targetExpressions = new Map<string, number>();
    for (const output of outputs) {
      if (output.expressions) {
        for (const [name, value] of Object.entries(output.expressions)) {
          if (value === undefined) continue;
          const existing = targetExpressions.get(name) ?? 0;
          if (FACE_EXPRESSIONS.has(name)) {
            targetExpressions.set(name, Math.min(Math.max(existing, value), 1));
          } else {
            targetExpressions.set(name, Math.min(existing + value, 1));
          }
        }
      }
    }

    // 3. Merge bone rotations (additive, skip locked bones)
    const targetBones = new Map<string, { x: number; y: number; z: number }>();
    for (const output of outputs) {
      if (output.boneRotations) {
        for (const [name, rot] of Object.entries(output.boneRotations)) {
          if (!rot || lockedBones.has(name)) continue;
          const existing = targetBones.get(name) ?? { x: 0, y: 0, z: 0 };
          targetBones.set(name, {
            x: existing.x + rot.x,
            y: existing.y + rot.y,
            z: existing.z + rot.z,
          });
        }
      }
    }

    // 4. Lerp expressions toward targets
    const lerpFactor = 1 - Math.exp(-LERP_SPEED * delta);

    const allExprNames = new Set([...this.currentExpressions.keys(), ...targetExpressions.keys()]);

    for (const name of allExprNames) {
      const target = targetExpressions.get(name) ?? 0;
      const current = this.currentExpressions.get(name) ?? 0;
      const newVal = current + (target - current) * lerpFactor;
      this.currentExpressions.set(name, newVal);

      if (vrm.expressionManager?.getExpression(name) != null) {
        vrm.expressionManager.setValue(name, Math.max(0, Math.min(1, newVal)));
      }
    }

    // 5. Lerp bone rotations toward targets, apply via quaternion
    const allBoneNames = new Set([...this.currentBoneRotations.keys(), ...targetBones.keys()]);

    for (const name of allBoneNames) {
      if (lockedBones.has(name)) continue;

      const target = targetBones.get(name) ?? { x: 0, y: 0, z: 0 };
      const current = this.currentBoneRotations.get(name) ?? { x: 0, y: 0, z: 0 };
      const newRot = {
        x: current.x + (target.x - current.x) * lerpFactor,
        y: current.y + (target.y - current.y) * lerpFactor,
        z: current.z + (target.z - current.z) * lerpFactor,
      };
      this.currentBoneRotations.set(name, newRot);

      const boneNode = vrm.humanoid?.getNormalizedBoneNode(name);
      if (boneNode) {
        if (this.three) {
          // Use quaternion to avoid sync issues with SpringBone
          const EulerCtor = this.three.Euler as new (...args: unknown[]) => unknown;
          const euler = new EulerCtor(newRot.x, newRot.y, newRot.z, "XYZ");
          boneNode.quaternion.setFromEuler(euler);
        } else {
          boneNode.rotation.x = newRot.x;
          boneNode.rotation.y = newRot.y;
          boneNode.rotation.z = newRot.z;
        }
      }
    }
  }

  reset(): void {
    for (const layer of this.layers) {
      layer.reset();
    }
    this.currentExpressions.clear();
    this.currentBoneRotations.clear();
  }
}
