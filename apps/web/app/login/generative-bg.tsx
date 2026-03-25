"use client";

import { useEffect, useRef } from "react";

/** Soft gradient blob background for the login page. */
export function GenerativeBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cvs = canvas;
    const c = ctx;

    let animId = 0;
    let w = 0;
    let h = 0;
    let t = 0;

    interface Blob {
      cx: number; // center x ratio (0-1)
      cy: number; // center y ratio (0-1)
      r: number; // radius ratio
      dx: number; // drift speed x
      dy: number; // drift speed y
      phase: number;
      color: [number, number, number]; // RGB
    }

    const blobs: Blob[] = [
      { cx: 0.25, cy: 0.3, r: 0.35, dx: 0.15, dy: 0.1, phase: 0, color: [96, 165, 250] }, // blue-400
      { cx: 0.75, cy: 0.6, r: 0.3, dx: 0.12, dy: 0.18, phase: 2, color: [147, 197, 253] }, // blue-300
      { cx: 0.5, cy: 0.8, r: 0.32, dx: 0.1, dy: 0.14, phase: 4, color: [186, 230, 253] }, // sky-200
      { cx: 0.2, cy: 0.7, r: 0.28, dx: 0.18, dy: 0.08, phase: 1.5, color: [165, 180, 252] }, // indigo-300
      { cx: 0.8, cy: 0.25, r: 0.33, dx: 0.08, dy: 0.16, phase: 3.5, color: [196, 181, 253] }, // violet-300
      { cx: 0.5, cy: 0.4, r: 0.25, dx: 0.14, dy: 0.12, phase: 5, color: [203, 213, 225] }, // slate-300
    ];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cvs.clientWidth;
      h = cvs.clientHeight;
      cvs.width = w * dpr;
      cvs.height = h * dpr;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      t += 0.003;

      // Clear with base color
      c.fillStyle = "#f1f5f9";
      c.fillRect(0, 0, w, h);

      // Draw each blob as a radial gradient circle
      c.globalCompositeOperation = "lighter";

      for (const b of blobs) {
        const x = w * (b.cx + Math.sin(t * b.dx * 2 + b.phase) * 0.15);
        const y = h * (b.cy + Math.cos(t * b.dy * 2 + b.phase * 1.3) * 0.12);
        const r = Math.min(w, h) * (b.r + Math.sin(t + b.phase) * 0.04);

        const grad = c.createRadialGradient(x, y, 0, x, y, r);
        const [cr, cg, cb] = b.color;
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.25)`);
        grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.10)`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);

        c.fillStyle = grad;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }

      c.globalCompositeOperation = "source-over";
      animId = requestAnimationFrame(draw);
    }

    resize();
    animId = requestAnimationFrame(draw);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: 0 }}
    />
  );
}
