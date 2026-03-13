"use client";

import { useTrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import type { ToggleSource } from "@livekit/components-core";

function MicOnIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
      <line x1="3" y1="3" x2="21" y2="21" strokeLinecap="round" />
    </svg>
  );
}

function CameraOnIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}

function CameraOffIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
      <line x1="2.25" y1="2.25" x2="21.75" y2="21.75" strokeLinecap="round" />
    </svg>
  );
}

function ScreenShareIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />
    </svg>
  );
}

const ICONS: Record<string, { on: () => React.JSX.Element; off: () => React.JSX.Element }> = {
  [Track.Source.Microphone]: { on: MicOnIcon, off: MicOffIcon },
  [Track.Source.Camera]: { on: CameraOnIcon, off: CameraOffIcon },
  [Track.Source.ScreenShare]: { on: ScreenShareIcon, off: ScreenShareIcon },
};

interface MediaToggleProps {
  source: ToggleSource;
  label: string;
  /** "dark" for meeting room, "light" for coworking */
  variant?: "dark" | "light";
}

export default function MediaToggle({ source, label, variant = "light" }: MediaToggleProps) {
  const { buttonProps, enabled } = useTrackToggle({ source });

  const icons = ICONS[source];
  const Icon = icons ? (enabled ? icons.on : icons.off) : null;

  let classes: string;
  if (enabled) {
    classes =
      variant === "dark"
        ? "bg-gray-700/80 text-white hover:bg-gray-600"
        : "bg-white text-gray-700 hover:bg-gray-100 shadow-sm";
  } else {
    classes = "bg-red-500 text-white hover:bg-red-600";
  }

  return (
    <div className="group relative">
      <button
        {...buttonProps}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors ${classes}`}
      >
        {Icon && <Icon />}
      </button>
      <span className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </div>
  );
}
