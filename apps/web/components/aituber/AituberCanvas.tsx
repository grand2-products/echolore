"use client";

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Suspense, useMemo } from "react";
import * as THREE from "three";
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

/** Fullscreen gradient background quad rendered behind the avatar. */
function GradientBackground() {
  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: {
        colorTop: { value: new THREE.Color("#1a1a2e") },
        colorBottom: { value: new THREE.Color("#0d0d1a") },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.9999, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 colorTop;
        uniform vec3 colorBottom;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(mix(colorBottom, colorTop, vUv.y), 1.0);
        }
      `,
    });
    return mat;
  }, []);

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export function AituberCanvas({ avatarUrl, onError }: AituberCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 1.3, 1.5], fov: 30, near: 0.1, far: 20 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
      onCreated={handleCanvasCreated}
      style={{ background: "#0d0d1a" }}
    >
      <GradientBackground />

      {/* 3-point lighting: key + fill + rim */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[2, 3, 2]} intensity={1.0} />
      <directionalLight position={[-1, 1, 2]} intensity={0.3} />
      <directionalLight position={[-1, 2, -1]} intensity={0.5} color="#b0c4ff" />

      <Suspense fallback={null}>
        <VrmModel avatarUrl={avatarUrl} onError={onError} />
      </Suspense>

      <EffectComposer>
        <Bloom luminanceThreshold={0.85} intensity={0.4} />
        <Vignette darkness={0.5} offset={0.5} />
      </EffectComposer>
    </Canvas>
  );
}
