export type AnnotationTool = "pointer" | "freehand" | "highlight";

export interface AnnotationPoint {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

interface AnnotationMessageBase {
  senderId: string;
  sharerIdentity: string;
  markId: string;
  ts: number;
}

export interface PointerMessage extends AnnotationMessageBase {
  type: "pointer";
  point: AnnotationPoint;
  color: string;
}

export interface FreehandStartMessage extends AnnotationMessageBase {
  type: "freehand-start";
  color: string;
  lineWidth: number;
}

export interface FreehandMoveMessage extends AnnotationMessageBase {
  type: "freehand-move";
  points: AnnotationPoint[];
}

export interface FreehandEndMessage extends AnnotationMessageBase {
  type: "freehand-end";
}

export interface HighlightMessage extends AnnotationMessageBase {
  type: "highlight";
  center: AnnotationPoint;
  radius: number;
  color: string;
}

export interface ClearMessage {
  type: "clear";
  senderId: string;
  sharerIdentity: string;
}

export type AnnotationMessage =
  | PointerMessage
  | FreehandStartMessage
  | FreehandMoveMessage
  | FreehandEndMessage
  | HighlightMessage
  | ClearMessage;

export interface AnnotationMark {
  id: string;
  type: "pointer" | "freehand" | "highlight";
  color: string;
  createdAt: number;
  // Pointer
  point?: AnnotationPoint;
  // Freehand
  points?: AnnotationPoint[];
  lineWidth?: number;
  // Highlight
  center?: AnnotationPoint;
  radius?: number;
}

export const ANNOTATION_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#eab308", // yellow
  "#ffffff", // white
  "#f97316", // orange
] as const;

export const DEFAULT_COLOR = ANNOTATION_COLORS[0];
export const DEFAULT_TOOL: AnnotationTool = "pointer";
