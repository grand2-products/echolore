"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { BlinkLayer } from "./animation/blink-layer";
import { BreathingLayer } from "./animation/breathing-layer";
import { AnimationCompositor } from "./animation/compositor";
import { EmotionLayer } from "./animation/emotion-layer";
import { IdleMotionLayer } from "./animation/idle-motion-layer";
import { LipSyncLayer } from "./animation/lip-sync-layer";
import { LookAtController } from "./animation/look-at-controller";
import { StateExpressionLayer } from "./animation/state-expression-layer";
import type { AnimationContext } from "./animation/types";
import { type AnimationClipDef, VrmAnimationController } from "./animation/VrmAnimationController";
import { useAituberStore } from "./use-aituber-store";

type VrmScene = { scene: THREE.Object3D };

interface VrmModelProps {
  avatarUrl: string;
  onError?: (message: string) => void;
}

interface MotionManifest {
  clips: AnimationClipDef[];
}

export function VrmModel({ avatarUrl, onError }: VrmModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<unknown>(null);
  const vrmUtilsRef = useRef<{ deepDispose: (obj: THREE.Object3D) => void } | null>(null);
  const compositorRef = useRef<AnimationCompositor | null>(null);
  const lookAtRef = useRef<LookAtController | null>(null);
  const animControllerRef = useRef<VrmAnimationController | null>(null);
  const elapsedRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!groupRef.current) return;

    const abortController = new AbortController();
    const group = groupRef.current;

    const init = async () => {
      const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }, THREE] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("@pixiv/three-vrm"),
        import("three"),
      ]);
      vrmUtilsRef.current = VRMUtils;
      if (abortController.signal.aborted) return;

      const loader = new GLTFLoader();
      loader.register((parser: unknown) => new VRMLoaderPlugin(parser as never));

      try {
        const gltf = await loader.loadAsync(avatarUrl);
        if (abortController.signal.aborted) return;

        const vrm = gltf.userData.vrm;
        if (!vrm) return;

        if (vrm.meta?.metaVersion === "0") {
          VRMUtils.rotateVRM0(vrm);
        }
        group.add(vrm.scene);
        vrmRef.current = vrm;

        // Compositor (procedural expressions + bone micro-movements)
        const compositor = new AnimationCompositor();
        compositor.setThree(THREE as never);
        compositor.setLayers([
          new BlinkLayer(),
          new BreathingLayer(),
          new IdleMotionLayer(),
          new LipSyncLayer(),
          new EmotionLayer(),
          new StateExpressionLayer(),
        ]);
        compositorRef.current = compositor;
        elapsedRef.current = 0;

        // LookAt (gaze drift)
        const lookAt = new LookAtController();
        lookAt.initialize(vrm, THREE);
        lookAtRef.current = lookAt;

        // Motion clip controller (VRMA idle + action clips)
        const mixer = new THREE.AnimationMixer(vrm.scene);
        const controller = new VrmAnimationController(vrm, mixer);
        animControllerRef.current = controller;

        // Load motion manifest (non-blocking)
        if (!abortController.signal.aborted) {
          void loadManifest(controller, abortController.signal);
        }
      } catch (err) {
        console.error("[VrmModel] Failed to load VRM:", err);
        onErrorRef.current?.("Failed to load avatar model");
      }
    };

    void init();

    return () => {
      abortController.abort();
      compositorRef.current?.reset();
      compositorRef.current = null;
      lookAtRef.current?.dispose();
      lookAtRef.current = null;
      animControllerRef.current?.dispose();
      animControllerRef.current = null;
      const vrm = vrmRef.current as VrmScene | null;
      if (vrm) {
        vrmUtilsRef.current?.deepDispose(vrm.scene);
        group.remove(vrm.scene);
      }
      vrmRef.current = null;
    };
  }, [avatarUrl]);

  useFrame((_state, delta) => {
    const vrm = vrmRef.current;
    if (!vrm) return;

    elapsedRef.current += delta;

    // 1. Compositor: procedural expressions + bone micro-movements
    const compositor = compositorRef.current;
    if (compositor) {
      const store = useAituberStore.getState();
      const context: AnimationContext = {
        avatarState: store.avatarState,
        emotion: store.emotion,
        elapsedTime: elapsedRef.current,
        visemes: store.currentVisemes,
      };
      // 2. Motion clips: play pending actions from store
      const controller = animControllerRef.current;
      if (controller) {
        const action = store.pendingAction;
        if (action) {
          void controller.playAction(action);
          useAituberStore.setState({ pendingAction: null });
        }
      }

      // Pass clip weight so compositor suppresses bone rotations that
      // the mixer would overwrite, preventing jumps on clip start/end.
      const clipWeight = controller?.getClipWeight() ?? 0;
      compositor.update(delta, context, vrm, clipWeight);

      // 3. LookAt: gaze drift
      lookAtRef.current?.update(context, delta);

      // 4. AnimationMixer: must run AFTER compositor so clip bones
      //    properly override the (now-suppressed) procedural bones.
      controller?.update(delta);
    }

    // 5. VRM internal update (expression override, spring bones, etc.)
    (vrm as { update: (d: number) => void }).update(delta);
  });

  return <group ref={groupRef} />;
}

async function loadManifest(
  controller: VrmAnimationController,
  signal: AbortSignal
): Promise<void> {
  try {
    const res = await fetch("/motions/manifest.json", { signal });
    if (!res.ok) return;
    const manifest: MotionManifest = await res.json();
    if (signal.aborted) return;
    await controller.init(manifest.clips);
  } catch {
    // manifest.json not found or network error — clips simply won't play
  }
}
