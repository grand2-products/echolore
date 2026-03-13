"use client";

import { VideoTrack } from "@livekit/components-react";
import type { TrackReference } from "@livekit/components-core";
import { useState } from "react";
import AnnotationToolbar from "./AnnotationToolbar";
import ScreenShareAnnotationOverlay from "./ScreenShareAnnotationOverlay";
import { useScreenAnnotation } from "./useScreenAnnotation";

interface ScreenShareViewProps {
  trackRef: TrackReference;
  sharerIdentity: string;
  localIdentity: string;
}

export default function ScreenShareView({
  trackRef,
  sharerIdentity,
  localIdentity,
}: ScreenShareViewProps) {
  const [annotationEnabled, setAnnotationEnabled] = useState(false);
  const annotation = useScreenAnnotation(sharerIdentity, localIdentity);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl ring-1 ring-white/10">
      <VideoTrack trackRef={trackRef} className="h-full w-full object-contain" />
      <ScreenShareAnnotationOverlay
        marks={annotation.marks}
        activeTool={annotation.activeTool}
        enabled={annotationEnabled}
        onPointer={annotation.sendPointer}
        onFreehandStart={annotation.sendFreehandStart}
        onFreehandMove={annotation.sendFreehandMove}
        onFreehandEnd={annotation.sendFreehandEnd}
        onHighlight={annotation.sendHighlight}
        pruneMarks={annotation.pruneMarks}
        fadeStart={annotation.FADE_START}
        fadeEnd={annotation.FADE_END}
      />
      <AnnotationToolbar
        activeTool={annotation.activeTool}
        onToolChange={annotation.setActiveTool}
        activeColor={annotation.activeColor}
        onColorChange={annotation.setActiveColor}
        colors={annotation.colors}
        annotationEnabled={annotationEnabled}
        onToggleAnnotation={() => setAnnotationEnabled((v) => !v)}
        onClear={annotation.sendClear}
      />
      {/* Sharer name badge */}
      <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
        {trackRef.participant.name || trackRef.participant.identity}
      </div>
    </div>
  );
}
