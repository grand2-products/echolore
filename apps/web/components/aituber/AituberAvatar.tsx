"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBlobUrl } from "@/lib/api/fetch";
import type { MotionProfile } from "./animation/collision-corrector";

const AituberCanvas = dynamic(
  () => import("./AituberCanvas").then((m) => ({ default: m.AituberCanvas })),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-gray-900" />,
  }
);

interface AituberAvatarProps {
  avatarUrl: string | null;
  motionProfileJson?: string | null;
}

export function AituberAvatar({ avatarUrl, motionProfileJson }: AituberAvatarProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!avatarUrl) {
      setResolvedUrl(null);
      return;
    }
    setLoadError(null);

    let cancelled = false;
    fetchBlobUrl(avatarUrl)
      .then((url) => {
        if (cancelled) return;
        if (url !== avatarUrl) {
          blobUrlRef.current = url;
        }
        setResolvedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Failed to load avatar model");
      });

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [avatarUrl]);

  const motionProfile = useMemo<MotionProfile | null>(() => {
    if (!motionProfileJson) return null;
    try {
      return JSON.parse(motionProfileJson) as MotionProfile;
    } catch {
      return null;
    }
  }, [motionProfileJson]);

  const handleCanvasError = useCallback((message: string) => {
    setLoadError(message);
  }, []);

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

  if (!resolvedUrl) {
    return <div className="h-full w-full bg-gray-900" />;
  }

  return (
    <div className="relative h-full w-full">
      <AituberCanvas
        avatarUrl={resolvedUrl}
        motionProfile={motionProfile}
        onError={handleCanvasError}
      />
    </div>
  );
}
