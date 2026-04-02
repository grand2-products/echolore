import { fbm1D } from "./noise";
import type { AnimationContext } from "./types";

type GazePhase = "focus" | "away";

/**
 * Manages VRM lookAt target with eye-contact cycling.
 *
 * Instead of pure random drift, alternates between:
 * - **focus**: looking at the camera with small micro-drift
 * - **away**: looking off to the side with larger drift
 *
 * State-dependent behavior:
 * - talking: 85% focus, 15% away
 * - thinking: 50% focus, 50% away (gaze shifts up-right)
 * - idle: 70% focus, 30% away
 */
export class LookAtController {
  // biome-ignore lint/suspicious/noExplicitAny: THREE.Object3D
  private target: any = null;
  // biome-ignore lint/suspicious/noExplicitAny: VRM instance
  private vrm: any = null;

  // Camera is at (0, 1.3, 1.5), model at origin facing +Z
  private readonly baseX = 0;
  private readonly baseY = 1.3;
  private readonly baseZ = 1.5;

  // Eye-contact cycle state
  private gazePhase: GazePhase = "focus";
  private phaseTimer = 0;
  private phaseDuration = 4;
  // Smoothly interpolated offsets for gaze transitions
  private currentOffX = 0;
  private currentOffY = 0;
  // Random away-direction chosen once per away phase
  private awayTargetX = 0;
  private awayTargetY = 0;

  // biome-ignore lint/suspicious/noExplicitAny: THREE module
  initialize(vrm: any, THREE: any): void {
    this.vrm = vrm;
    if (!vrm.lookAt) return;

    this.target = new THREE.Object3D();
    this.target.position.set(this.baseX, this.baseY, this.baseZ);
    vrm.scene.add(this.target);
    vrm.lookAt.target = this.target;
  }

  update(context: AnimationContext): void {
    if (!this.target) return;

    const t = context.elapsedTime;
    const delta = 1 / 60; // approximate; LookAtController doesn't receive delta
    const talking = context.avatarState === "talking";
    const thinking = context.avatarState === "thinking";

    // Determine focus/away ratio based on state
    const focusRatio = thinking ? 0.5 : talking ? 0.85 : 0.7;

    // Phase transition
    this.phaseTimer += delta;
    if (this.phaseTimer >= this.phaseDuration) {
      this.phaseTimer = 0;
      if (this.gazePhase === "focus") {
        this.gazePhase = "away";
        this.phaseDuration = 1 + Math.random() * 2; // 1-3s away
        // Pick a random away direction
        this.awayTargetX = (Math.random() - 0.5) * 0.6;
        this.awayTargetY = (Math.random() - 0.3) * 0.3;
      } else {
        this.gazePhase = "focus";
        this.phaseDuration = 3 + Math.random() * 3; // 3-6s focus
      }
      // Adjust durations by focus ratio
      if (this.gazePhase === "focus") {
        this.phaseDuration *= focusRatio / 0.7;
      } else {
        this.phaseDuration *= (1 - focusRatio) / 0.3;
      }
    }

    // Compute target offsets for current phase
    let targetOffX: number;
    let targetOffY: number;

    if (this.gazePhase === "focus") {
      // Small micro-drift around camera
      targetOffX = fbm1D(t * 0.5 + 50) * 0.05;
      targetOffY = fbm1D(t * 0.4 + 150) * 0.03;
    } else {
      // Larger drift around away target
      targetOffX = this.awayTargetX + fbm1D(t * 0.3 + 200) * 0.08;
      targetOffY = this.awayTargetY + fbm1D(t * 0.25 + 300) * 0.05;
    }

    // Thinking: shift gaze upward-right
    if (thinking) {
      targetOffX += 0.25;
      targetOffY += 0.12;
    }

    // Smooth interpolation toward target offset
    const lerpSpeed = 1 - Math.exp(-4 * delta);
    this.currentOffX += (targetOffX - this.currentOffX) * lerpSpeed;
    this.currentOffY += (targetOffY - this.currentOffY) * lerpSpeed;

    this.target.position.set(
      this.baseX + this.currentOffX,
      this.baseY + this.currentOffY,
      this.baseZ
    );
  }

  dispose(): void {
    if (this.target && this.vrm?.scene) {
      this.vrm.scene.remove(this.target);
    }
    if (this.vrm?.lookAt) {
      this.vrm.lookAt.target = null;
    }
    this.target = null;
    this.vrm = null;
  }
}
