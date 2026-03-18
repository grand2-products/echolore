"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three";

type VrmScene = { scene: THREE.Object3D };

interface VrmModelProps {
  avatarUrl: string;
  onError?: (message: string) => void;
}

export function VrmModel({ avatarUrl, onError }: VrmModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const vrmRef = useRef<unknown>(null);
  const vrmUtilsRef = useRef<{ deepDispose: (obj: THREE.Object3D) => void } | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!groupRef.current) return;

    const abortController = new AbortController();
    const group = groupRef.current;

    const init = async () => {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");
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
      } catch (err) {
        console.error("[VrmModel] Failed to load VRM:", err);
        onErrorRef.current?.("Failed to load avatar model");
      }
    };

    void init();

    return () => {
      abortController.abort();
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
    (vrm as { update: (d: number) => void }).update(delta);
  });

  return <group ref={groupRef} />;
}
