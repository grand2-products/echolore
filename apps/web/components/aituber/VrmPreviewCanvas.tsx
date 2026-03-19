"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useT } from "@/lib/i18n";
import type { EmotionType } from "./animation/types";
import { type AnimationClipDef, VrmAnimationController } from "./animation/VrmAnimationController";

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

type PoseMode = "rest" | "tpose";

type VRMPoseMap = Record<string, { rotation?: [number, number, number, number] }>;

interface VrmPreviewSceneProps {
  avatarUrl: string;
  emotion: EmotionType;
  poseMode: PoseMode;
  activeClip: { id: string; seq: number } | null;
  clips: AnimationClipDef[];
}

function VrmPreviewScene({
  avatarUrl,
  emotion,
  poseMode,
  activeClip,
  clips,
}: VrmPreviewSceneProps) {
  // --- Refs: Three.js / VRM ---
  const groupRef = useRef<THREE.Group>(null);
  // biome-ignore lint/suspicious/noExplicitAny: VRM type not exported
  const vrmRef = useRef<any>(null);
  const vrmUtilsRef = useRef<{ deepDispose: (obj: THREE.Object3D) => void } | null>(null);
  const controllerRef = useRef<VrmAnimationController | null>(null);
  const isVrm0Ref = useRef(false);

  // --- Refs: props synced for useFrame ---
  const emotionRef = useRef(emotion);
  emotionRef.current = emotion;
  const poseModeRef = useRef(poseMode);
  poseModeRef.current = poseMode;
  const clipsRef = useRef(clips);
  clipsRef.current = clips;

  // --- Refs: T-pose interpolation ---
  const restPoseRef = useRef<VRMPoseMap | null>(null);
  const poseTransitionRef = useRef(0); // 0 = rest, 1 = tpose
  const identityQRef = useRef(new THREE.Quaternion());
  const boneQRef = useRef(new THREE.Quaternion());

  // --- Effect: Load VRM model ---
  useEffect(() => {
    if (!groupRef.current) return;
    const group = groupRef.current;
    const abort = new AbortController();

    const load = async () => {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { VRMLoaderPlugin, VRMUtils } = await import("@pixiv/three-vrm");
      vrmUtilsRef.current = VRMUtils;
      if (abort.signal.aborted) return;

      const loader = new GLTFLoader();
      loader.register((parser: unknown) => new VRMLoaderPlugin(parser as never));

      const gltf = await loader.loadAsync(avatarUrl);
      if (abort.signal.aborted) return;

      const vrm = gltf.userData.vrm;
      if (!vrm) return;

      const isVrm0 = vrm.meta?.metaVersion === "0";
      isVrm0Ref.current = isVrm0;
      if (isVrm0) VRMUtils.rotateVRM0(vrm);

      group.add(vrm.scene);
      vrmRef.current = vrm;
      restPoseRef.current = vrm.humanoid.getNormalizedPose() as VRMPoseMap;

      const mixer = new THREE.AnimationMixer(vrm.scene);
      const controller = new VrmAnimationController(vrm, mixer);
      controllerRef.current = controller;

      // Init with clips if manifest already fetched
      if (clipsRef.current.length > 0) {
        void controller.init(clipsRef.current);
      }
    };

    load().catch((err) => console.error("[VrmPreviewScene] Failed to load VRM:", err));

    return () => {
      abort.abort();
      controllerRef.current?.dispose();
      controllerRef.current = null;
      const vrm = vrmRef.current;
      if (vrm) {
        vrmUtilsRef.current?.deepDispose(vrm.scene);
        group.remove(vrm.scene);
      }
      vrmRef.current = null;
    };
  }, [avatarUrl]);

  // --- Effect: Feed clips to controller (idempotent — init() is safe to call twice) ---
  useEffect(() => {
    if (controllerRef.current && clips.length > 0) {
      void controllerRef.current.init(clips);
    }
  }, [clips]);

  // --- Effect: Play action or return to idle ---
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    if (activeClip) {
      void ctrl.playAction(activeClip.id);
    } else {
      ctrl.returnToIdle();
    }
  }, [activeClip]);

  // --- useFrame: animation + expression + pose ---
  useFrame((_state, delta) => {
    const vrm = vrmRef.current;
    if (!vrm) return;

    const ctrl = controllerRef.current;

    // 1) Animation state machine
    ctrl?.update(delta);

    // 2) T-pose toggle — pause/resume controller
    const wantTpose = poseModeRef.current === "tpose";
    if (ctrl) {
      if (wantTpose && !ctrl.isPaused()) ctrl.pause();
      else if (!wantTpose && ctrl.isPaused()) ctrl.resume();
    }

    // 3) Interpolate pose (rest ↔ T-pose)
    const targetT = wantTpose ? 1 : 0;
    const currentT = poseTransitionRef.current;
    if (Math.abs(currentT - targetT) > 0.001) {
      const step = Math.min(delta * 5, Math.abs(targetT - currentT));
      const newT = currentT + Math.sign(targetT - currentT) * step;
      poseTransitionRef.current = newT;

      const restPose = restPoseRef.current;
      if (restPose) {
        const idQ = identityQRef.current;
        const bQ = boneQRef.current;
        const pose: VRMPoseMap = {};
        for (const [name, t] of Object.entries(restPose)) {
          if (t.rotation) {
            bQ.set(...t.rotation).slerp(idQ, newT);
            pose[name] = { rotation: [bQ.x, bQ.y, bQ.z, bQ.w] };
          }
        }
        vrm.humanoid.setNormalizedPose(pose);
      }
    }

    // 4) Expression
    const isVrm0 = isVrm0Ref.current;
    const map = isVrm0 ? VRM0_EXPRESSIONS : VRM1_EXPRESSIONS;
    const allNames = isVrm0 ? ALL_VRM0_NAMES : ALL_VRM1_NAMES;
    const mgr = isVrm0 ? vrm.blendShapeProxy : vrm.expressionManager;
    if (mgr) {
      for (const n of allNames) mgr.setValue(n, 0);
      const target = map[emotionRef.current];
      if (target && target !== "neutral") mgr.setValue(target, 1.0);
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
  const [clips, setClips] = useState<AnimationClipDef[]>([]);
  const [emotion, setEmotion] = useState<EmotionType>("neutral");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [activeClip, setActiveClip] = useState<{ id: string; seq: number } | null>(null);
  const [poseMode, setPoseMode] = useState<PoseMode>("rest");
  const seqRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch manifest
  useEffect(() => {
    let cancelled = false;
    fetch("/motions/manifest.json")
      .then((r) => r.json())
      .then((data: { clips: AnimationClipDef[] }) => {
        if (!cancelled) setClips(data.clips);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Group by category
  const categories = useMemo(() => {
    const map = new Map<string, AnimationClipDef[]>();
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
            poseMode={poseMode}
            activeClip={activeClip}
            clips={clips}
          />
        </Suspense>

        <EffectComposer>
          <Bloom luminanceThreshold={0.9} intensity={0.3} />
        </EffectComposer>
      </Canvas>

      {/* Controls overlay */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 grid grid-cols-2 gap-2 rounded-b-lg bg-gray-900/80 px-3 py-2 backdrop-blur-sm">
        {/* Expression panel */}
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            {t("aituber.preview.panelExpression")}
          </p>
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
        </div>

        {/* Pose panel */}
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            {t("aituber.preview.panelPose")}
          </p>
          <div className="flex flex-wrap gap-1">
            {(["rest", "tpose"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPoseMode(p)}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  poseMode === p
                    ? "bg-purple-500 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {t(`aituber.preview.pose.${p}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Motion panel (full width) */}
        <div className="col-span-2 space-y-1 border-t border-gray-700 pt-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            {t("aituber.preview.panelMotion")}
          </p>
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
    </div>
  );
}
