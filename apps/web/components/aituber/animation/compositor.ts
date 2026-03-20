import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

const FACE_EXPRESSIONS = new Set(["happy", "sad", "angry", "surprised", "relaxed", "neutral"]);

const LERP_SPEED = 8;

interface ThreeKit {
  Euler: new (
    x: number,
    y: number,
    z: number,
    order?: string
  ) => {
    set: (x: number, y: number, z: number, order: string) => void;
  };
}

export class AnimationCompositor {
  private layers: AnimationLayer[] = [];
  private currentExpressions = new Map<string, number>();
  private currentBones = new Map<string, { x: number; y: number; z: number }>();
  private dirtyExpressions = new Set<string>();
  private dirtyBones = new Set<string>();
  private tempEuler: { set: (x: number, y: number, z: number, order: string) => void } | null =
    null;

  setLayers(layers: AnimationLayer[]): void {
    this.layers = layers;
  }

  setThree(three: ThreeKit): void {
    this.tempEuler = new three.Euler(0, 0, 0);
  }

  // biome-ignore lint/suspicious/noExplicitAny: VRM type not exported
  update(delta: number, context: AnimationContext, vrm: any): void {
    const outputs: LayerOutput[] = [];
    for (const layer of this.layers) {
      outputs.push(layer.update(delta, context));
    }

    // --- Merge expressions ---
    const targetExpr = new Map<string, number>();
    for (const out of outputs) {
      if (!out.expressions) continue;
      for (const [name, value] of Object.entries(out.expressions)) {
        if (value === undefined) continue;
        const existing = targetExpr.get(name) ?? 0;
        if (FACE_EXPRESSIONS.has(name)) {
          targetExpr.set(name, Math.max(existing, value));
        } else {
          targetExpr.set(name, existing + value);
        }
      }
    }

    // --- Merge bone rotations ---
    const targetBones = new Map<string, { x: number; y: number; z: number }>();
    for (const out of outputs) {
      if (!out.boneRotations) continue;
      for (const [name, rot] of Object.entries(out.boneRotations)) {
        if (!rot) continue;
        const existing = targetBones.get(name) ?? { x: 0, y: 0, z: 0 };
        targetBones.set(name, {
          x: existing.x + rot.x,
          y: existing.y + rot.y,
          z: existing.z + rot.z,
        });
      }
    }

    // --- LERP expressions toward targets ---
    const factor = 1 - Math.exp(-LERP_SPEED * delta);
    const allExprNames = new Set([...this.currentExpressions.keys(), ...targetExpr.keys()]);
    for (const name of allExprNames) {
      const target = targetExpr.get(name) ?? 0;
      const current = this.currentExpressions.get(name) ?? 0;
      const val = current + (target - current) * factor;
      const clamped = Math.max(0, Math.min(1, val));
      if (clamped < 0.001) {
        this.currentExpressions.delete(name);
      } else {
        this.currentExpressions.set(name, clamped);
      }
    }

    // --- LERP bone rotations toward targets ---
    const allBoneNames = new Set([...this.currentBones.keys(), ...targetBones.keys()]);
    for (const name of allBoneNames) {
      const target = targetBones.get(name) ?? { x: 0, y: 0, z: 0 };
      const current = this.currentBones.get(name) ?? { x: 0, y: 0, z: 0 };
      const newRot = {
        x: current.x + (target.x - current.x) * factor,
        y: current.y + (target.y - current.y) * factor,
        z: current.z + (target.z - current.z) * factor,
      };
      const magnitude = Math.abs(newRot.x) + Math.abs(newRot.y) + Math.abs(newRot.z);
      if (magnitude < 0.0001) {
        this.currentBones.delete(name);
      } else {
        this.currentBones.set(name, newRot);
      }
    }

    // --- Apply to VRM ---
    this.applyToVrm(vrm);
  }

  // biome-ignore lint/suspicious/noExplicitAny: VRM type not exported
  private applyToVrm(vrm: any): void {
    const mgr = vrm.expressionManager;
    if (mgr) {
      for (const [name, value] of this.currentExpressions) {
        mgr.setValue(name, value);
        this.dirtyExpressions.add(name);
      }
      // Zero out expressions that were previously set but are no longer active
      for (const name of this.dirtyExpressions) {
        if (!this.currentExpressions.has(name)) {
          mgr.setValue(name, 0);
          this.dirtyExpressions.delete(name);
        }
      }
    }

    const humanoid = vrm.humanoid;
    if (humanoid && this.tempEuler) {
      for (const [name, rot] of this.currentBones) {
        const bone = humanoid.getNormalizedBoneNode(name);
        if (!bone) continue;
        this.tempEuler.set(rot.x, rot.y, rot.z, "XYZ");
        bone.quaternion.setFromEuler(this.tempEuler);
        this.dirtyBones.add(name);
      }
      for (const name of this.dirtyBones) {
        if (!this.currentBones.has(name)) {
          const bone = humanoid.getNormalizedBoneNode(name);
          if (bone) {
            bone.quaternion.identity();
          }
          this.dirtyBones.delete(name);
        }
      }
    }
  }

  reset(): void {
    for (const layer of this.layers) {
      layer.reset();
    }
    this.currentExpressions.clear();
    this.currentBones.clear();
    // dirtyExpressions intentionally NOT cleared — will be zeroed out on next applyToVrm
  }
}
