"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AnnotationMark, AnnotationPoint, AnnotationTool } from "./annotation-types";

interface ScreenShareAnnotationOverlayProps {
  marks: AnnotationMark[];
  activeTool: AnnotationTool;
  enabled: boolean;
  onPointer: (point: AnnotationPoint) => void;
  onFreehandStart: (point: AnnotationPoint) => void;
  onFreehandMove: (points: AnnotationPoint[]) => void;
  onFreehandEnd: () => void;
  onHighlight: (center: AnnotationPoint, radius: number) => void;
  pruneMarks: () => void;
  fadeStart: number;
  fadeEnd: number;
}

export default function ScreenShareAnnotationOverlay({
  marks,
  activeTool,
  enabled,
  onPointer,
  onFreehandStart,
  onFreehandMove,
  onFreehandEnd,
  onHighlight,
  pruneMarks,
  fadeStart,
  fadeEnd,
}: ScreenShareAnnotationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const pointBatchRef = useRef<AnnotationPoint[]>([]);
  const highlightStartRef = useRef<AnnotationPoint | null>(null);
  const rafRef = useRef<number>(0);

  const getNormalized = useCallback(
    (e: React.MouseEvent | React.TouchEvent): AnnotationPoint | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      let clientX: number;
      let clientY: number;
      if ("touches" in e) {
        const touch = e.touches[0];
        if (!touch) return null;
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!enabled) return;
      const point = getNormalized(e);
      if (!point) return;
      e.preventDefault();

      if (activeTool === "pointer") {
        onPointer(point);
      } else if (activeTool === "freehand") {
        isDrawingRef.current = true;
        pointBatchRef.current = [];
        onFreehandStart(point);
      } else if (activeTool === "highlight") {
        highlightStartRef.current = point;
      }
    },
    [enabled, activeTool, getNormalized, onPointer, onFreehandStart]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!enabled) return;
      const point = getNormalized(e);
      if (!point) return;

      if (activeTool === "pointer") {
        onPointer(point);
      } else if (activeTool === "freehand" && isDrawingRef.current) {
        e.preventDefault();
        pointBatchRef.current.push(point);
        if (pointBatchRef.current.length >= 3) {
          onFreehandMove([...pointBatchRef.current]);
          pointBatchRef.current = [];
        }
      }
    },
    [enabled, activeTool, getNormalized, onPointer, onFreehandMove]
  );

  const handlePointerUp = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!enabled) return;

      if (activeTool === "freehand" && isDrawingRef.current) {
        if (pointBatchRef.current.length > 0) {
          onFreehandMove([...pointBatchRef.current]);
          pointBatchRef.current = [];
        }
        isDrawingRef.current = false;
        onFreehandEnd();
      } else if (activeTool === "highlight" && highlightStartRef.current) {
        const endPoint = getNormalized(e);
        if (endPoint) {
          const dx = endPoint.x - highlightStartRef.current.x;
          const dy = endPoint.y - highlightStartRef.current.y;
          const radius = Math.max(0.02, Math.sqrt(dx * dx + dy * dy));
          onHighlight(highlightStartRef.current, radius);
        }
        highlightStartRef.current = null;
      }
    },
    [enabled, activeTool, getNormalized, onFreehandMove, onFreehandEnd, onHighlight]
  );

  // Keep marks in a ref so the render loop always sees the latest without re-creating the effect
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const fadeStartRef = useRef(fadeStart);
  fadeStartRef.current = fadeStart;
  const fadeEndRef = useRef(fadeEnd);
  fadeEndRef.current = fadeEnd;

  // Prune marks on a stable interval (outside the render loop to avoid state updates during draw)
  useEffect(() => {
    const timer = setInterval(pruneMarks, 1000);
    return () => clearInterval(timer);
  }, [pruneMarks]);

  // Render loop + ResizeObserver — stable deps, no re-creation on marks change
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    resizeObserver.observe(container);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const now = Date.now();
      const currentMarks = marksRef.current;
      const fStart = fadeStartRef.current;
      const fEnd = fadeEndRef.current;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      for (const mark of currentMarks) {
        const age = now - mark.createdAt;
        let opacity = 1;
        if (age > fStart) {
          opacity = Math.max(0, 1 - (age - fStart) / (fEnd - fStart));
        }
        if (opacity <= 0) continue;

        ctx.globalAlpha = opacity;

        if (mark.type === "pointer" && mark.point) {
          const px = mark.point.x * w;
          const py = mark.point.y * h;
          ctx.beginPath();
          ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.fillStyle = mark.color;
          ctx.shadowColor = mark.color;
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (mark.type === "freehand" && mark.points && mark.points.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = mark.color;
          ctx.lineWidth = mark.lineWidth ?? 3;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          const first = mark.points[0];
          if (!first) continue;
          ctx.moveTo(first.x * w, first.y * h);
          for (let i = 1; i < mark.points.length; i++) {
            const p = mark.points[i];
            if (!p) continue;
            ctx.lineTo(p.x * w, p.y * h);
          }
          ctx.stroke();
        } else if (mark.type === "highlight" && mark.center) {
          const cx = mark.center.x * w;
          const cy = mark.center.y * h;
          const r = (mark.radius ?? 0.05) * Math.min(w, h);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = `${mark.color}33`; // semi-transparent
          ctx.fill();
          ctx.strokeStyle = mark.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
    };
  }, []); // stable — reads from refs

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20"
      style={{ pointerEvents: enabled ? "auto" : "none" }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      />
    </div>
  );
}
