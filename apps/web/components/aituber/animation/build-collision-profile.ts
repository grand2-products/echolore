/**
 * Mesh analyser — builds a {@link MotionProfile} from a loaded VRM model.
 *
 * At avatar-setup time this module inspects the VRM's SkinnedMesh geometry
 * to determine which vertices belong to the torso (chest / upperChest) and
 * fits a collision capsule around them.  The resulting profile is stored in
 * the database alongside the character record and loaded at playback time
 * by {@link CollisionCorrector}.
 *
 * Performance: typically 100-300 ms for models with 30-80 k vertices.
 */

import type * as THREE from "three";
import type { CollisionCapsule, MotionProfile, VrmLike } from "./collision-corrector";

type ThreeVec3 = { x: number; y: number; z: number };

/** Minimum skin-weight threshold to consider a vertex "owned" by a bone. */
const WEIGHT_THRESHOLD = 0.25;

/** Extra padding added to capsule radius (metres). */
const RADIUS_PADDING = 0.015;

/** Bones to create capsules for (torso region). */
const CAPSULE_BONES = ["chest", "upperChest"] as const;

/**
 * Build a collision profile from a loaded VRM.
 *
 * @param vrm   A loaded `@pixiv/three-vrm` VRM instance.
 * @param THREE The Three.js namespace (dynamic import).
 * @returns A MotionProfile ready for JSON serialisation and DB storage.
 */
export function buildCollisionProfile(vrm: VrmLike, THREE: typeof import("three")): MotionProfile {
  const capsules: CollisionCapsule[] = [];

  for (const boneName of CAPSULE_BONES) {
    const capsule = buildCapsuleForBone(vrm, THREE, boneName);
    if (capsule) capsules.push(capsule);
  }

  return { capsules, version: 1 };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildCapsuleForBone(
  vrm: VrmLike,
  THREE: typeof import("three"),
  boneName: string
): CollisionCapsule | null {
  const boneNode = vrm.humanoid?.getNormalizedBoneNode(boneName) as THREE.Object3D | null;
  if (!boneNode) return null;

  const vertices = collectVerticesForBone(vrm, THREE, boneNode);
  if (vertices.length < 8) return null; // Not enough geometry to fit

  return fitCapsule(vertices, boneNode as THREE.Object3D, THREE, boneName);
}

/**
 * Collect world-space positions of vertices primarily driven by a given bone.
 */
function collectVerticesForBone(
  vrm: VrmLike,
  THREE: typeof import("three"),
  targetBone: THREE.Object3D
): ThreeVec3[] {
  const vertices: ThreeVec3[] = [];
  const pos = new THREE.Vector3();

  vrm.scene.traverse((child: THREE.Object3D) => {
    if (child.type !== "SkinnedMesh") return;

    const mesh = child as THREE.SkinnedMesh;
    const geo = mesh.geometry;
    if (!geo?.attributes?.skinIndex || !geo?.attributes?.skinWeight) return;

    const skinIdx = geo.attributes.skinIndex as THREE.BufferAttribute;
    const skinWt = geo.attributes.skinWeight as THREE.BufferAttribute;
    const position = geo.attributes.position as THREE.BufferAttribute;

    // Find the bone index in this mesh's skeleton
    const boneIndex = mesh.skeleton?.bones?.indexOf(targetBone as THREE.Bone) ?? -1;
    if (boneIndex === -1) return;

    for (let i = 0; i < position.count; i++) {
      let weight = 0;
      for (let j = 0; j < 4; j++) {
        if (skinIdx.getComponent(i, j) === boneIndex) {
          weight += skinWt.getComponent(i, j);
        }
      }
      if (weight < WEIGHT_THRESHOLD) continue;

      pos.fromBufferAttribute(position, i);
      // Transform to world space via the mesh's current matrix
      const worldPos = pos.clone();
      mesh.localToWorld(worldPos);
      vertices.push(worldPos);
    }
  });

  return vertices;
}

/**
 * Fit a Y-axis capsule (cylinder + hemispherical caps) around a set of
 * world-space points, expressed relative to the anchor bone.
 */
function fitCapsule(
  vertices: ThreeVec3[],
  anchorBone: THREE.Object3D,
  THREE: typeof import("three"),
  boneName: string
): CollisionCapsule {
  // Compute centroid
  const center = new THREE.Vector3();
  for (const v of vertices) center.add(v);
  center.divideScalar(vertices.length);

  // Determine radial extent (XZ) and vertical extent (Y) from centroid.
  // Use 95th percentile for radius to avoid outlier vertices (accessories,
  // protruding mesh artifacts) inflating the capsule.
  const radials: number[] = [];
  let minY = Infinity;
  let maxY = -Infinity;

  for (const v of vertices) {
    const dx = v.x - center.x;
    const dz = v.z - center.z;
    radials.push(Math.sqrt(dx * dx + dz * dz));
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }

  radials.sort((a, b) => a - b);
  const p95Index = Math.min(Math.floor(radials.length * 0.95), radials.length - 1);
  const maxRadial = radials[p95Index] ?? 0;

  const halfHeight = (maxY - minY) / 2;

  // Convert centre to bone-local offset
  const boneWorldInv = new THREE.Matrix4().copy(anchorBone.matrixWorld).invert();
  const localCenter = center.clone().applyMatrix4(boneWorldInv);

  return {
    boneAnchor: boneName,
    offset: [localCenter.x, localCenter.y, localCenter.z],
    radius: maxRadial + RADIUS_PADDING,
    halfHeight: Math.max(halfHeight, 0.02), // Floor to avoid degenerate capsules
  };
}
