"use client";

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense } from "react";
import { VrmModel } from "./VrmModel";

function handleCanvasCreated({
  camera,
}: {
  camera: { lookAt: (x: number, y: number, z: number) => void };
}) {
  camera.lookAt(0, 1.0, 0);
}

export interface AituberCanvasProps {
  avatarUrl: string;
  onError?: (message: string) => void;
}

export function AituberCanvas({ avatarUrl, onError }: AituberCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 1.3, 1.5], fov: 30, near: 0.1, far: 20 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onCreated={handleCanvasCreated}
      style={{ background: "#1a1a2e" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[1, 2, 1]} intensity={0.8} />

      <Suspense fallback={null}>
        <VrmModel avatarUrl={avatarUrl} onError={onError} />
      </Suspense>

      <EffectComposer>
        <Bloom luminanceThreshold={0.9} intensity={0.3} />
      </EffectComposer>
    </Canvas>
  );
}
