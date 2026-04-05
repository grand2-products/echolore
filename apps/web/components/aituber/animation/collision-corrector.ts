/**
 * Collision Corrector — push-out bone correction using capsule colliders.
 *
 * After the AnimationMixer applies clip poses, this corrector checks whether
 * arm bones penetrate torso collision capsules.  When penetration is detected
 * the bone is pushed outward along the capsule surface so that, for example,
 * an "arms crossed" pose naturally rests *on top of* thick clothing instead
 * of clipping through it.
 *
 * The correction preserves the clip's original intent — it only adjusts
 * the minimal amount needed to resolve the collision.
 *
 * Usage in the frame loop (VrmModel.tsx):
 *   1. compositor.update()          — procedural layers
 *   2. controller.update()          — VRMA clip mixer
 *   3. collisionCorrector.correct() — ��� this module
 *   4. vrm.update()                 ��� spring bone physics
 */

import type * as THREE from "three";

/** Minimal VRM humanoid interface used by the corrector. */
interface VrmHumanoid {
  getNormalizedBoneNode(name: string): THREE.Object3D | null;
  getRawBoneNode(name: string): THREE.Object3D | null;
}

/** Minimal VRM instance expected by {@link CollisionCorrector.correct}. */
export interface VrmLike {
  humanoid?: VrmHumanoid;
  scene: THREE.Object3D;
}

export interface CollisionCapsule {
  /** Bone the capsule follows (e.g. "chest", "upperChest") */
  boneAnchor: string;
  /** Offset from the anchor bone's local origin [x, y, z] */
  offset: [number, number, number];
  /** Capsule radius (in world units, typically metres) */
  radius: number;
  /** Half-height of the cylindrical section along the main axis */
  halfHeight: number;
}

export interface MotionProfile {
  capsules: CollisionCapsule[];
  version: number;
}

/** Bones whose world positions are checked against capsules each frame. */
const TARGET_BONES = [
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
] as const;

/**
 * Maximum correction magnitude per frame (metres).  Prevents bones from
 * teleporting if the capsule profile doesn't match the animation scale.
 */
const MAX_CORRECTION = 0.08;

/** Pre-allocated temporaries initialised by {@link CollisionCorrector.setThree}. */
interface Temporaries {
  worldPos: THREE.Vector3;
  capsuleCenter: THREE.Vector3;
  pushDir: THREE.Vector3;
  correction: THREE.Vector3;
  localDir: THREE.Vector3;
  corrQuat: THREE.Quaternion;
  rotAxis: THREE.Vector3;
  boneFwd: THREE.Vector3;
  mat3: THREE.Matrix3;
}

export class CollisionCorrector {
  private capsules: CollisionCapsule[] = [];
  private tmp: Temporaries | null = null;

  /** Call once after THREE is available (dynamic import). */
  setThree(three: typeof THREE): void {
    this.tmp = {
      worldPos: new three.Vector3(),
      capsuleCenter: new three.Vector3(),
      pushDir: new three.Vector3(),
      correction: new three.Vector3(),
      localDir: new three.Vector3(),
      corrQuat: new three.Quaternion(),
      rotAxis: new three.Vector3(),
      boneFwd: new three.Vector3(),
      mat3: new three.Matrix3(),
    };
  }

  setProfile(profile: MotionProfile | null): void {
    this.capsules = profile?.capsules ?? [];
  }

  hasProfile(): boolean {
    return this.capsules.length > 0;
  }

  correct(vrm: VrmLike): void {
    if (this.capsules.length === 0 || !this.tmp) return;

    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    const t = this.tmp;

    // Ensure world matrices reflect mixer + compositor output so capsule
    // centres and bone positions are accurate.  This is intentionally called
    // before vrm.update() — spring-bone physics in vrm.update() will then
    // incorporate the corrected bone poses from this pass.
    vrm.scene.updateMatrixWorld();

    for (const boneName of TARGET_BONES) {
      const bone = humanoid.getNormalizedBoneNode(boneName);
      if (!bone) continue;

      bone.getWorldPosition(t.worldPos);

      for (const capsule of this.capsules) {
        const anchor = humanoid.getNormalizedBoneNode(capsule.boneAnchor);
        if (!anchor) continue;

        // Capsule centre in world space
        t.capsuleCenter.set(...capsule.offset);
        anchor.localToWorld(t.capsuleCenter);

        const penetration = this.calcPenetration(t.worldPos, t.capsuleCenter, capsule);

        if (penetration <= 0) continue;

        // Push direction: from capsule centre toward the bone
        t.pushDir.copy(t.worldPos).sub(t.capsuleCenter).normalize();

        // Suppress vertical component so arms push forward/sideways, not up/down
        t.pushDir.y *= 0.3;
        t.pushDir.normalize();

        // Clamp correction magnitude
        const amount = Math.min(penetration, MAX_CORRECTION);

        t.correction.copy(t.pushDir).multiplyScalar(amount);

        this.applyWorldCorrection(bone, t.correction);

        // Re-read world pos for subsequent capsule checks on same bone
        bone.getWorldPosition(t.worldPos);
      }
    }
  }

  // ---------------------------------------------------------------------------

  private calcPenetration(
    point: { x: number; y: number; z: number },
    center: { x: number; y: number; z: number },
    capsule: CollisionCapsule
  ): number {
    // Capsule is oriented along Y axis relative to the anchor bone.
    // Project the point onto the capsule's central segment.
    const dy = point.y - center.y;
    const clamped = Math.max(-capsule.halfHeight, Math.min(capsule.halfHeight, dy));

    // Nearest point on the capsule axis
    const nx = center.x;
    const ny = center.y + clamped;
    const nz = center.z;

    const dx = point.x - nx;
    const dyz = point.y - ny;
    const dz = point.z - nz;
    const dist = Math.sqrt(dx * dx + dyz * dyz + dz * dz);

    // Positive = inside capsule (penetrating)
    return capsule.radius - dist;
  }

  /**
   * Convert a world-space push offset into a parent-local rotation correction
   * that swings the bone outward.
   *
   * Algorithm:
   *  1. Get the bone's current forward direction in parent-local space
   *  2. Convert worldOffset to parent-local direction (rotation only via Matrix3)
   *  3. Compute small rotation angle = |offset| / boneLength
   *  4. Rotation axis = cross(boneFwd, localDir)
   *  5. Apply as quaternion premultiply
   */
  private applyWorldCorrection(bone: THREE.Object3D, worldOffset: THREE.Vector3): void {
    const parent = bone.parent;
    if (!parent || !this.tmp) return;

    const t = this.tmp;

    const offsetMag = worldOffset.length();
    if (offsetMag < 1e-6) return;

    // Parent's inverse rotation (3x3 only — no translation contamination)
    t.mat3.setFromMatrix4(parent.matrixWorld);
    if (t.mat3.determinant() === 0) return; // Degenerate matrix — skip correction
    t.mat3.invert();

    // Convert world push direction to parent-local space
    t.localDir.copy(worldOffset).applyMatrix3(t.mat3).normalize();

    // Bone forward direction in parent-local space (along the bone vector)
    t.boneFwd.copy(bone.position);
    const boneLen = t.boneFwd.length() || 0.1;
    t.boneFwd.normalize();

    // Rotation axis: perpendicular to both bone direction and push direction
    t.rotAxis.crossVectors(t.boneFwd, t.localDir);
    const axisLen = t.rotAxis.length();
    if (axisLen < 1e-6) return; // Push is parallel to bone — no meaningful rotation
    t.rotAxis.divideScalar(axisLen); // normalize

    // Rotation angle: small-angle approximation — offset / bone length
    const angle = offsetMag / boneLen;

    t.corrQuat.setFromAxisAngle(t.rotAxis, angle);
    bone.quaternion.premultiply(t.corrQuat);
  }
}
