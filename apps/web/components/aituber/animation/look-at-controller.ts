import { fbm1D } from "./noise";
import type { AnimationContext } from "./types";

/**
 * Manages VRM lookAt target with noise-based drift.
 * Not an AnimationLayer — directly manipulates VRM's lookAt target Object3D.
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
    const talking = context.avatarState === "talking";
    const thinking = context.avatarState === "thinking";

    const driftScale = talking ? 1.3 : 1;
    let x = this.baseX + fbm1D(t * 0.3 + 50) * 0.15 * driftScale;
    let y = this.baseY + fbm1D(t * 0.25 + 150) * 0.1 * driftScale;
    const z = this.baseZ;

    if (thinking) {
      x += 0.3;
      y += 0.15;
    }

    this.target.position.set(x, y, z);
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
