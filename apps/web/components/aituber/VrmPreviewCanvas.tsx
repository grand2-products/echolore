"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useT } from "@/lib/i18n";
import type { EmotionType } from "./animation/types";

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

interface ManifestClip {
  id: string;
  file: string;
  category: string;
  description: string;
  duration: number;
  loop: boolean;
}

// ---------------------------------------------------------------------------
// Expression mapping
// ---------------------------------------------------------------------------

const VRM1_EXPRESSIONS: Record<EmotionType, string> = {
  neutral: "neutral",
  happy: "happy",
  sad: "sad",
  angry: "angry",
  surprised: "surprised",
  relaxed: "relaxed",
};

const VRM0_EXPRESSIONS: Record<EmotionType, string> = {
  neutral: "neutral",
  happy: "joy",
  sad: "sorrow",
  angry: "angry",
  surprised: "surprised",
  relaxed: "fun",
};

const ALL_VRM1_NAMES = Object.values(VRM1_EXPRESSIONS);
const ALL_VRM0_NAMES = Object.values(VRM0_EXPRESSIONS);

// ---------------------------------------------------------------------------
// i18n key mappings
// ---------------------------------------------------------------------------

const CATEGORY_I18N_KEYS: Record<string, string> = {
  greeting: "aituber.preview.motionCategories.greeting",
  nod: "aituber.preview.motionCategories.nod",
  laugh: "aituber.preview.motionCategories.laugh",
  surprise: "aituber.preview.motionCategories.surprise",
  sad: "aituber.preview.motionCategories.sad",
  angry: "aituber.preview.motionCategories.angry",
  think: "aituber.preview.motionCategories.think",
  explain: "aituber.preview.motionCategories.explain",
  reaction: "aituber.preview.motionCategories.reaction",
  idle: "aituber.preview.motionCategories.idle",
};

// ---------------------------------------------------------------------------
// R3F inner scene
// ---------------------------------------------------------------------------

interface VrmPreviewSceneProps {
  avatarUrl: string;
  emotion: EmotionType;
  activeClip: { id: string; seq: number } | null;
  clips: ManifestClip[];
}

function VrmPreviewScene({ avatarUrl, emotion, activeClip, clips }: VrmPreviewSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  // biome-ignore lint/suspicious/noExplicitAny: VRM type not exported
  const vrmRef = useRef<any>(null);
  const vrmUtilsRef = useRef<{ deepDispose: (obj: THREE.Object3D) => void } | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const isVrm0Ref = useRef(false);
  const emotionRef = useRef(emotion);
  emotionRef.current = emotion;

  // Load VRM model
  useEffect(() => {
    if (!groupRef.current) return;
    const group = groupRef.current;
    const abortController = new AbortController();

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

        const isVrm0 = vrm.meta?.metaVersion === "0";
        isVrm0Ref.current = isVrm0;
        if (isVrm0) VRMUtils.rotateVRM0(vrm);

        group.add(vrm.scene);
        vrmRef.current = vrm;
        mixerRef.current = new THREE.AnimationMixer(vrm.scene);
      } catch (err) {
        console.error("[VrmPreviewScene] Failed to load VRM:", err);
      }
    };

    void init();

    return () => {
      abortController.abort();
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
      currentActionRef.current = null;
      const vrm = vrmRef.current;
      if (vrm) {
        vrmUtilsRef.current?.deepDispose(vrm.scene);
        group.remove(vrm.scene);
      }
      vrmRef.current = null;
    };
  }, [avatarUrl]);

  // Load and play motion clip
  useEffect(() => {
    const vrm = vrmRef.current;
    const mixer = mixerRef.current;
    if (!activeClip || !vrm || !mixer) return;

    const clip = clips.find((c) => c.id === activeClip.id);
    if (!clip) return;

    let cancelled = false;

    const loadClip = async () => {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { VRMAnimationLoaderPlugin, createVRMAnimationClip } = await import(
        "@pixiv/three-vrm-animation"
      );
      if (cancelled) return;

      const loader = new GLTFLoader();
      loader.register((parser: unknown) => new VRMAnimationLoaderPlugin(parser as never));

      try {
        const gltf = await loader.loadAsync(`/motions/${clip.file}`);
        if (cancelled) return;

        const vrmAnimation = gltf.userData.vrmAnimations?.[0];
        if (!vrmAnimation) return;

        const animClip = createVRMAnimationClip(vrmAnimation, vrm);
        const action = mixer.clipAction(animClip);
        action.clampWhenFinished = true;
        action.setLoop(clip.loop ? THREE.LoopRepeat : THREE.LoopOnce, clip.loop ? Infinity : 1);

        const prev = currentActionRef.current;
        if (prev) {
          action.crossFadeFrom(prev, 0.3, true);
        }
        action.reset().play();
        currentActionRef.current = action;
      } catch (err) {
        console.error("[VrmPreviewScene] Failed to load motion:", err);
      }
    };

    void loadClip();

    return () => {
      cancelled = true;
      const action = currentActionRef.current;
      if (action) {
        action.fadeOut(0.3);
      }
    };
  }, [activeClip, clips]);

  // Update expression + VRM + mixer every frame
  useFrame((_state, delta) => {
    const vrm = vrmRef.current;
    if (!vrm) return;

    // Apply expression after mixer update so it overrides animation expression tracks
    mixerRef.current?.update(delta);

    const isVrm0 = isVrm0Ref.current;
    const map = isVrm0 ? VRM0_EXPRESSIONS : VRM1_EXPRESSIONS;
    const allNames = isVrm0 ? ALL_VRM0_NAMES : ALL_VRM1_NAMES;
    const manager = isVrm0 ? vrm.blendShapeProxy : vrm.expressionManager;
    if (manager) {
      for (const name of allNames) {
        manager.setValue(name, 0);
      }
      const target = map[emotionRef.current];
      if (target && target !== "neutral") {
        manager.setValue(target, 1.0);
      }
    }

    vrm.update(delta);
  });

  return <group ref={groupRef} />;
}

function handleCanvasCreated({
  camera,
}: {
  camera: { lookAt: (x: number, y: number, z: number) => void };
}) {
  camera.lookAt(0, 1.0, 0);
}

// ---------------------------------------------------------------------------
// Emotion buttons
// ---------------------------------------------------------------------------

const EMOTIONS: EmotionType[] = ["neutral", "happy", "sad", "angry", "surprised", "relaxed"];
const EMOTION_I18N_KEYS: Record<EmotionType, string> = {
  neutral: "aituber.preview.emotions.neutral",
  happy: "aituber.preview.emotions.happy",
  sad: "aituber.preview.emotions.sad",
  angry: "aituber.preview.emotions.angry",
  surprised: "aituber.preview.emotions.surprised",
  relaxed: "aituber.preview.emotions.relaxed",
};

// ---------------------------------------------------------------------------
// Exported component
// ---------------------------------------------------------------------------

export interface VrmPreviewCanvasProps {
  avatarUrl: string;
}

export function VrmPreviewCanvas({ avatarUrl }: VrmPreviewCanvasProps) {
  const t = useT();
  const [clips, setClips] = useState<ManifestClip[]>([]);
  const [emotion, setEmotion] = useState<EmotionType>("neutral");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [activeClip, setActiveClip] = useState<{ id: string; seq: number } | null>(null);
  const seqRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch manifest
  useEffect(() => {
    let cancelled = false;
    fetch("/motions/manifest.json")
      .then((r) => r.json())
      .then((data: { clips: ManifestClip[] }) => {
        if (!cancelled) setClips(data.clips);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Group by category
  const categories = useMemo(() => {
    const map = new Map<string, ManifestClip[]>();
    for (const c of clips) {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return map;
  }, [clips]);

  const filteredClips = useMemo(
    () => (selectedCategory ? (categories.get(selectedCategory) ?? []) : clips),
    [categories, selectedCategory, clips]
  );

  const handleClipSelect = useCallback((id: string) => {
    if (!id) {
      setActiveClip(null);
      return;
    }
    seqRef.current += 1;
    setActiveClip({ id, seq: seqRef.current });
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <Canvas
        camera={{ position: [0, 1.3, 1.5], fov: 30, near: 0.1, far: 20 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onCreated={handleCanvasCreated}
        style={{ background: "#1a1a2e" }}
        eventSource={containerRef as unknown as React.RefObject<HTMLElement>}
        eventPrefix="offset"
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[1, 2, 1]} intensity={0.8} />

        <Suspense fallback={null}>
          <VrmPreviewScene
            avatarUrl={avatarUrl}
            emotion={emotion}
            activeClip={activeClip}
            clips={clips}
          />
        </Suspense>

        <EffectComposer>
          <Bloom luminanceThreshold={0.9} intensity={0.3} />
        </EffectComposer>
      </Canvas>

      {/* Controls overlay */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 space-y-2 rounded-b-lg bg-gray-900/80 px-3 py-2 backdrop-blur-sm">
        {/* Emotions */}
        <div className="flex flex-wrap gap-1">
          {EMOTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmotion(e)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                emotion === e
                  ? "bg-blue-500 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {t(EMOTION_I18N_KEYS[e])}
            </button>
          ))}
        </div>

        {/* Motions */}
        <div className="flex gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              handleClipSelect("");
            }}
            className="flex-1 rounded bg-gray-700 px-2 py-1 text-xs text-gray-200"
          >
            <option value="">{t("aituber.preview.allCategories")}</option>
            {[...categories.keys()].map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_I18N_KEYS[cat] ? t(CATEGORY_I18N_KEYS[cat]) : cat}
              </option>
            ))}
          </select>
          <select
            value={activeClip?.id ?? ""}
            onChange={(e) => handleClipSelect(e.target.value)}
            className="flex-1 rounded bg-gray-700 px-2 py-1 text-xs text-gray-200"
          >
            <option value="">{t("aituber.preview.selectMotion")}</option>
            {filteredClips.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id.replace(/-/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
