"use client";

import type { AituberAvatarState } from "@echolore/shared/contracts";
import { useEffect, useRef } from "react";

interface AituberAvatarProps {
  avatarUrl: string | null;
  avatarState: AituberAvatarState;
  audioAnalyser?: AnalyserNode | null;
}

export function AituberAvatar({ avatarUrl, avatarState, audioAnalyser }: AituberAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<unknown>(null);
  const vrmRef = useRef<unknown>(null);
  const clockRef = useRef<{ getDelta: () => number } | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current || !avatarUrl) return;

    let cancelled = false;

    const initScene = async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");

      if (cancelled || !containerRef.current) return;

      const container = containerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

      // Scene setup
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e);

      const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
      camera.position.set(0, 1.3, 1.5);
      camera.lookAt(0, 1.0, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(1, 2, 1);
      scene.add(directionalLight);

      const clock = new THREE.Clock();
      clockRef.current = clock;

      // Load VRM
      const loader = new GLTFLoader();
      loader.register((parser: unknown) => new VRMLoaderPlugin(parser as never));

      try {
        const gltf = await loader.loadAsync(avatarUrl);
        if (cancelled) return;

        const vrm = gltf.userData.vrm;
        if (!vrm) return;

        VRMUtils.rotateVRM0(vrm);
        scene.add(vrm.scene);
        vrmRef.current = vrm;

        // Animation loop
        const animate = () => {
          if (cancelled) return;
          animFrameRef.current = requestAnimationFrame(animate);
          const delta = clock.getDelta();
          vrm.update(delta);
          renderer.render(scene, camera);
        };
        animate();
      } catch (err) {
        console.error("[AituberAvatar] Failed to load VRM:", err);
      }

      // Handle resize
      const onResize = () => {
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);

      return () => {
        window.removeEventListener("resize", onResize);
      };
    };

    void initScene();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      const renderer = rendererRef.current as {
        dispose?: () => void;
        domElement?: HTMLElement;
      } | null;
      if (renderer?.domElement && containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer?.dispose?.();
      rendererRef.current = null;
      vrmRef.current = null;
    };
  }, [avatarUrl]);

  // Update avatar expressions based on state
  useEffect(() => {
    const vrm = vrmRef.current as {
      expressionManager?: {
        setValue: (name: string, value: number) => void;
      };
    } | null;
    if (!vrm?.expressionManager) return;

    const em = vrm.expressionManager;

    // Reset expressions
    em.setValue("happy", 0);
    em.setValue("blink", 0);
    em.setValue("aa", 0);

    switch (avatarState) {
      case "thinking":
        em.setValue("happy", 0.3);
        break;
      case "talking":
        // Lip sync handled by audio analyser below
        break;
      default:
        break;
    }
  }, [avatarState]);

  // Lip sync from audio analyser
  useEffect(() => {
    if (!audioAnalyser || avatarState !== "talking") return;

    const dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
    let frame: number;

    const updateLipSync = () => {
      frame = requestAnimationFrame(updateLipSync);
      audioAnalyser.getByteFrequencyData(dataArray);

      // Calculate average amplitude
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] ?? 0;
      }
      const avg = sum / dataArray.length / 255;

      const vrm = vrmRef.current as {
        expressionManager?: {
          setValue: (name: string, value: number) => void;
        };
      } | null;
      if (vrm?.expressionManager) {
        vrm.expressionManager.setValue("aa", Math.min(avg * 3, 1));
      }
    };

    updateLipSync();
    return () => cancelAnimationFrame(frame);
  }, [audioAnalyser, avatarState]);

  if (!avatarUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-900 text-gray-400">
        <div className="text-center">
          <div className="mb-2 text-4xl">🤖</div>
          <p className="text-sm">AI Character</p>
          <p className="mt-1 text-xs text-gray-500">
            {avatarState === "thinking" ? "🤔 ..." : avatarState === "talking" ? "💬 ..." : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* Avatar state indicator */}
      <div className="absolute left-3 top-3 z-10">
        {avatarState === "thinking" && (
          <span className="rounded-full bg-yellow-500/80 px-2 py-1 text-xs text-white">
            Thinking...
          </span>
        )}
        {avatarState === "talking" && (
          <span className="rounded-full bg-green-500/80 px-2 py-1 text-xs text-white">
            Speaking
          </span>
        )}
      </div>
    </div>
  );
}
