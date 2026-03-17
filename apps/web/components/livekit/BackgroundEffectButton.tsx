"use client";

import { useLocalParticipant } from "@livekit/components-react";
import { type LocalVideoTrack, Track } from "livekit-client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addCustomBackground,
  applyBackgroundEffect,
  BACKGROUND_CATEGORIES,
  type BackgroundEffect,
  effectEquals,
  getCustomBackgrounds,
  getStoredBackgroundEffect,
  PRESET_BACKGROUNDS,
  removeCustomBackground,
  storeBackgroundEffect,
} from "@/lib/background-processor";
import { useT } from "@/lib/i18n";

interface BackgroundEffectButtonProps {
  variant?: "dark" | "light";
}

export default function BackgroundEffectButton({ variant = "light" }: BackgroundEffectButtonProps) {
  const t = useT();
  const [effect, setEffect] = useState<BackgroundEffect>("none");
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [customBgs, setCustomBgs] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { localParticipant, cameraTrack } = useLocalParticipant();

  useEffect(() => {
    setEffect(getStoredBackgroundEffect());
    setCustomBgs(getCustomBackgrounds());
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  const localParticipantRef = useRef(localParticipant);
  localParticipantRef.current = localParticipant;

  const getVideoTrack = useCallback((): LocalVideoTrack | null => {
    const pub = localParticipantRef.current.getTrackPublication(Track.Source.Camera);
    if (!pub?.track || pub.track.kind !== Track.Kind.Video) return null;
    return pub.track as LocalVideoTrack;
  }, []);

  // Re-fire whenever the camera track appears (e.g. camera enabled after mount).
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current || !cameraTrack?.track) return;
    const stored = getStoredBackgroundEffect();
    if (stored === "none") return;
    appliedRef.current = true;
    void applyBackgroundEffect(cameraTrack.track as LocalVideoTrack, stored);
  }, [cameraTrack]);

  const handleSelect = async (next: BackgroundEffect) => {
    setApplying(true);
    try {
      const track = getVideoTrack();
      if (track) {
        await applyBackgroundEffect(track, next);
      }
      setEffect(next);
      storeBackgroundEffect(next);
    } catch (err) {
      console.error("[BackgroundEffectButton] processor failed:", err);
    } finally {
      setApplying(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      addCustomBackground(dataUrl);
      setCustomBgs(getCustomBackgrounds());
      void handleSelect({ type: "image", url: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveCustom = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeCustomBackground(url);
    setCustomBgs(getCustomBackgrounds());
    if (typeof effect === "object" && effect.url === url) {
      void handleSelect("none");
    }
  };

  const isSelected = (candidate: BackgroundEffect) => effectEquals(effect, candidate);

  const isActive = effect !== "none";

  const buttonClasses =
    variant === "dark"
      ? `${isActive ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-gray-700/80 text-white hover:bg-gray-600"}`
      : `${isActive ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-white text-gray-700 hover:bg-gray-100 shadow-sm"}`;

  return (
    <div ref={menuRef} className="group relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={applying}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-60 ${buttonClasses}`}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
          />
        </svg>
      </button>
      {!open && (
        <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {applying ? t("background.applying") : t("background.label")}
        </span>
      )}

      {open && (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-4 shadow-xl"
          style={{ width: "min(420px, 90vw)" }}
        >
          {/* Blur options */}
          <div className="mb-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t("background.blurSection")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleSelect("none")}
                className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg border-2 text-xs font-medium transition ${
                  isSelected("none")
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {t("background.none")}
              </button>
              <button
                type="button"
                onClick={() => void handleSelect("blur-light")}
                className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg border-2 text-xs font-medium transition ${
                  isSelected("blur-light")
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="6" strokeDasharray="3 2" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => void handleSelect("blur")}
                className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg border-2 text-xs font-medium transition ${
                  isSelected("blur")
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8" strokeDasharray="2 2" />
                  <circle cx="12" cy="12" r="4" strokeDasharray="2 2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Custom backgrounds */}
          {customBgs.length > 0 && (
            <div className="mb-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {t("background.custom")}
              </p>
              <div className="flex flex-wrap gap-2">
                {customBgs.map((url) => (
                  <div key={url} className="group/custom relative">
                    <button
                      type="button"
                      onClick={() => void handleSelect({ type: "image", url })}
                      className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${
                        isSelected({ type: "image", url })
                          ? "border-blue-500"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <Image
                        src={url}
                        alt=""
                        width={56}
                        height={56}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveCustom(url, e)}
                      className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white shadow group-hover/custom:flex"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preset backgrounds */}
          <div className="mb-3 max-h-52 overflow-y-auto">
            {BACKGROUND_CATEGORIES.map((cat) => {
              const presets = PRESET_BACKGROUNDS.filter((p) => p.category === cat);
              if (presets.length === 0) return null;
              return (
                <div key={cat} className="mb-2">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {t(`background.cat.${cat}`)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => {
                      const eff: BackgroundEffect = { type: "image", url: preset.url };
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => void handleSelect(eff)}
                          title={t(`background.preset.${preset.id}`)}
                          className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${
                            isSelected(eff)
                              ? "border-blue-500"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <Image
                            src={preset.url}
                            alt={t(`background.preset.${preset.id}`)}
                            width={56}
                            height={56}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 transition hover:border-gray-400 hover:bg-gray-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t("background.upload")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
