"use client";

import type { AituberAvatarState } from "@echolore/shared/contracts";
import { useEffect, useRef, useState } from "react";
import {
  AnimationCompositor,
  BlinkLayer,
  BreathingLayer,
  EmotionLayer,
  IdleMotionLayer,
  LipSyncLayer,
  LookAtLayer,
  MotionClipLayer,
  StateExpressionLayer,
} from "./animation";
import type { AnimationContext, EmotionState, VisemeEntry } from "./animation/types";

interface AituberAvatarProps {
  avatarUrl: string | null;
  avatarState: AituberAvatarState;
  audioAnalyser?: AnalyserNode | null;
  audioSampleRate?: number;
  emotion?: EmotionState | null;
  visemes?: VisemeEntry[] | null;
  action?: string | null;
}

export function AituberAvatar({
  avatarUrl,
  avatarState,
  audioAnalyser,
  audioSampleRate,
  emotion,
  visemes,
  action,
}: AituberAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<unknown>(null);
  const vrmRef = useRef<unknown>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const clockRef = useRef<{ getDelta: () => number } | null>(null);
  const animFrameRef = useRef<number>(0);
  const compositorRef = useRef<AnimationCompositor | null>(null);
  const elapsedRef = useRef(0);

  const avatarStateRef = useRef<AituberAvatarState>(avatarState);
  const audioAnalyserRef = useRef<AnalyserNode | null>(audioAnalyser ?? null);
  const audioSampleRateRef = useRef(audioSampleRate ?? 48000);
  const emotionRef = useRef<EmotionState | null>(emotion ?? null);
  const visemesRef = useRef<VisemeEntry[] | null>(visemes ?? null);
  const actionRef = useRef<string | null>(action ?? null);

  useEffect(() => {
    avatarStateRef.current = avatarState;
  }, [avatarState]);
  useEffect(() => {
    audioAnalyserRef.current = audioAnalyser ?? null;
  }, [audioAnalyser]);
  useEffect(() => {
    audioSampleRateRef.current = audioSampleRate ?? 48000;
  }, [audioSampleRate]);
  useEffect(() => {
    emotionRef.current = emotion ?? null;
  }, [emotion]);
  useEffect(() => {
    visemesRef.current = visemes ?? null;
  }, [visemes]);
  useEffect(() => {
    actionRef.current = action ?? null;
  }, [action]);

  useEffect(() => {
    if (!containerRef.current || !avatarUrl) return;
    setLoadError(null);

    const abortController = new AbortController();

    const initScene = async () => {
      const THREE = await import("three");
      if (abortController.signal.aborted) return;

      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");
      if (abortController.signal.aborted || !containerRef.current) return;

      const container = containerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

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

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(1, 2, 1);
      scene.add(directionalLight);

      const clock = new THREE.Clock();
      clockRef.current = clock;
      elapsedRef.current = 0;

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
        scene.add(vrm.scene);
        vrmRef.current = vrm;

        // Set up compositor with all layers
        const compositor = new AnimationCompositor();
        compositor.setThree(THREE);
        compositor.addLayer(new BlinkLayer());
        compositor.addLayer(new BreathingLayer());
        compositor.addLayer(new IdleMotionLayer());
        compositor.addLayer(new LipSyncLayer());
        compositor.addLayer(new EmotionLayer());
        compositor.addLayer(new StateExpressionLayer());

        const lookAtLayer = new LookAtLayer();
        lookAtLayer.setup(vrm, THREE, scene);
        compositor.addLayer(lookAtLayer);

        // Motion clip layer — loads manifest and sets up VRMA loader
        const motionClipLayer = new MotionClipLayer();
        await motionClipLayer.initialize(vrm, THREE);
        if (abortController.signal.aborted) return;
        compositor.addLayer(motionClipLayer);

        compositorRef.current = compositor;

        // Animation loop
        const animate = () => {
          if (abortController.signal.aborted) return;
          animFrameRef.current = requestAnimationFrame(animate);
          const delta = clock.getDelta();
          elapsedRef.current += delta;

          const context: AnimationContext = {
            avatarState: avatarStateRef.current,
            audioAnalyser: audioAnalyserRef.current,
            audioSampleRate: audioSampleRateRef.current,
            emotion: emotionRef.current,
            elapsedTime: elapsedRef.current,
            visemes: visemesRef.current,
            action: actionRef.current,
          };

          compositor.update(delta, context, vrm);
          vrm.update(delta);
          renderer.render(scene, camera);
        };
        animate();
      } catch (err) {
        console.error("[AituberAvatar] Failed to load VRM:", err);
        setLoadError("Failed to load avatar model");
        return;
      }

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
      abortController.abort();
      cancelAnimationFrame(animFrameRef.current);
      compositorRef.current?.reset();
      compositorRef.current = null;
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

  if (loadError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-900 text-gray-400">
        <div className="text-center">
          <div className="mb-2 text-4xl">⚠️</div>
          <p className="text-sm text-red-400">{loadError}</p>
        </div>
      </div>
    );
  }

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
