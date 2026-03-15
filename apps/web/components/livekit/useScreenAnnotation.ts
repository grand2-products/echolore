"use client";

import { useDataChannel } from "@livekit/components-react";
import { useCallback, useRef, useState } from "react";
import {
  ANNOTATION_COLORS,
  type AnnotationMark,
  type AnnotationMessage,
  type AnnotationPoint,
  type AnnotationTool,
  DEFAULT_COLOR,
  DEFAULT_TOOL,
} from "./annotation-types";

const FADE_START = 3000;
const FADE_END = 5000;

export function useScreenAnnotation(sharerIdentity: string, localIdentity: string) {
  const [activeTool, setActiveTool] = useState<AnnotationTool>(DEFAULT_TOOL);
  const [activeColor, setActiveColor] = useState<string>(DEFAULT_COLOR);
  const marksRef = useRef<AnnotationMark[]>([]);
  const [, forceUpdate] = useState(0);
  const encoderRef = useRef(new TextEncoder());
  const decoderRef = useRef(new TextDecoder());

  const triggerRender = useCallback(() => forceUpdate((n) => n + 1), []);

  const pruneMarks = useCallback(() => {
    const now = Date.now();
    marksRef.current = marksRef.current.filter((m) => now - m.createdAt < FADE_END);
  }, []);

  const addMark = useCallback(
    (mark: AnnotationMark) => {
      pruneMarks();
      marksRef.current.push(mark);
      triggerRender();
    },
    [pruneMarks, triggerRender]
  );

  const onMessage = useCallback(
    (msg: { payload: Uint8Array }) => {
      try {
        const parsed: AnnotationMessage = JSON.parse(decoderRef.current.decode(msg.payload));
        if (parsed.type === "clear") {
          marksRef.current = [];
          triggerRender();
          return;
        }
        if (parsed.type === "pointer") {
          addMark({
            id: parsed.markId,
            type: "pointer",
            color: parsed.color,
            createdAt: Date.now(),
            point: parsed.point,
          });
        } else if (parsed.type === "freehand-start") {
          addMark({
            id: parsed.markId,
            type: "freehand",
            color: parsed.color,
            lineWidth: parsed.lineWidth,
            createdAt: Date.now(),
            points: [],
          });
        } else if (parsed.type === "freehand-move") {
          const mark = marksRef.current.find((m) => m.id === parsed.markId);
          if (mark?.points) {
            mark.points.push(...parsed.points);
            triggerRender();
          }
        } else if (parsed.type === "freehand-end") {
          // no-op, stroke is complete
        } else if (parsed.type === "highlight") {
          addMark({
            id: parsed.markId,
            type: "highlight",
            color: parsed.color,
            createdAt: Date.now(),
            center: parsed.center,
            radius: parsed.radius,
          });
        }
      } catch {
        // ignore
      }
    },
    [addMark, triggerRender]
  );

  const { send } = useDataChannel("screen-annotation", onMessage);

  const sendMessage = useCallback(
    (msg: AnnotationMessage) => {
      const payload = encoderRef.current.encode(JSON.stringify(msg));
      const reliable = msg.type === "clear";
      void send(payload, { reliable });
    },
    [send]
  );

  const sendPointer = useCallback(
    (point: AnnotationPoint) => {
      const markId = crypto.randomUUID();
      const msg: AnnotationMessage = {
        type: "pointer",
        senderId: localIdentity,
        sharerIdentity,
        markId,
        ts: Date.now(),
        point,
        color: activeColor,
      };
      sendMessage(msg);
      addMark({
        id: markId,
        type: "pointer",
        color: activeColor,
        createdAt: Date.now(),
        point,
      });
    },
    [activeColor, localIdentity, sharerIdentity, sendMessage, addMark]
  );

  const currentStrokeId = useRef<string | null>(null);

  const sendFreehandStart = useCallback(
    (point: AnnotationPoint) => {
      const markId = crypto.randomUUID();
      currentStrokeId.current = markId;
      const msg: AnnotationMessage = {
        type: "freehand-start",
        senderId: localIdentity,
        sharerIdentity,
        markId,
        ts: Date.now(),
        color: activeColor,
        lineWidth: 3,
      };
      sendMessage(msg);
      addMark({
        id: markId,
        type: "freehand",
        color: activeColor,
        lineWidth: 3,
        createdAt: Date.now(),
        points: [point],
      });
    },
    [activeColor, localIdentity, sharerIdentity, sendMessage, addMark]
  );

  const sendFreehandMove = useCallback(
    (points: AnnotationPoint[]) => {
      const markId = currentStrokeId.current;
      if (!markId) return;
      const msg: AnnotationMessage = {
        type: "freehand-move",
        senderId: localIdentity,
        sharerIdentity,
        markId,
        ts: Date.now(),
        points,
      };
      sendMessage(msg);
      const mark = marksRef.current.find((m) => m.id === markId);
      if (mark?.points) {
        mark.points.push(...points);
        triggerRender();
      }
    },
    [localIdentity, sharerIdentity, sendMessage, triggerRender]
  );

  const sendFreehandEnd = useCallback(() => {
    const markId = currentStrokeId.current;
    if (!markId) return;
    currentStrokeId.current = null;
    const msg: AnnotationMessage = {
      type: "freehand-end",
      senderId: localIdentity,
      sharerIdentity,
      markId,
      ts: Date.now(),
    };
    sendMessage(msg);
  }, [localIdentity, sharerIdentity, sendMessage]);

  const sendHighlight = useCallback(
    (center: AnnotationPoint, radius: number) => {
      const markId = crypto.randomUUID();
      const msg: AnnotationMessage = {
        type: "highlight",
        senderId: localIdentity,
        sharerIdentity,
        markId,
        ts: Date.now(),
        center,
        radius,
        color: activeColor,
      };
      sendMessage(msg);
      addMark({
        id: markId,
        type: "highlight",
        color: activeColor,
        createdAt: Date.now(),
        center,
        radius,
      });
    },
    [activeColor, localIdentity, sharerIdentity, sendMessage, addMark]
  );

  const sendClear = useCallback(() => {
    sendMessage({
      type: "clear",
      senderId: localIdentity,
      sharerIdentity,
    });
    marksRef.current = [];
    triggerRender();
  }, [localIdentity, sharerIdentity, sendMessage, triggerRender]);

  return {
    marks: marksRef.current,
    activeTool,
    setActiveTool,
    activeColor,
    setActiveColor,
    colors: ANNOTATION_COLORS,
    sendPointer,
    sendFreehandStart,
    sendFreehandMove,
    sendFreehandEnd,
    sendHighlight,
    sendClear,
    pruneMarks,
    FADE_START,
    FADE_END,
  };
}
