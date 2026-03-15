"use client";

import type { ActiveReaction } from "@/lib/hooks/use-reactions";

interface ReactionOverlayProps {
  reactions: ActiveReaction[];
  onComplete: (id: string) => void;
}

export default function ReactionOverlay({ reactions, onComplete }: ReactionOverlayProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="animate-reaction-float absolute bottom-4 text-3xl"
          style={{ left: `${r.x}%` }}
          onAnimationEnd={() => onComplete(r.id)}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
