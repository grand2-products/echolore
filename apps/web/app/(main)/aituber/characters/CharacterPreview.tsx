"use client";

import type { AituberCharacterDto, VisemeEntry } from "@echolore/shared/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { AituberAvatar } from "@/components/aituber/AituberAvatar";
import type { MotionClipDef } from "@/components/aituber/animation/motion-clip-layer";
import type { EmotionState, EmotionType } from "@/components/aituber/animation/types";
import { aituberApi } from "@/lib/api/aituber";
import {
  type AudioNodes,
  decodeBase64Audio,
  ensureAudioNodes,
  playAudioBuffer,
} from "@/lib/audio-utils";
import { useT } from "@/lib/i18n";

interface CharacterPreviewProps {
  character: AituberCharacterDto;
}

const EMOTIONS: EmotionType[] = ["neutral", "happy", "sad", "angry", "surprised", "relaxed"];

const CATEGORY_COLORS: Record<string, string> = {
  idle: "bg-gray-100 text-gray-700 hover:bg-gray-200",
  greeting: "bg-blue-100 text-blue-700 hover:bg-blue-200",
  laugh: "bg-yellow-100 text-yellow-700 hover:bg-yellow-200",
  angry: "bg-red-100 text-red-700 hover:bg-red-200",
  sad: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200",
  surprise: "bg-orange-100 text-orange-700 hover:bg-orange-200",
  think: "bg-purple-100 text-purple-700 hover:bg-purple-200",
  explain: "bg-teal-100 text-teal-700 hover:bg-teal-200",
  nod: "bg-green-100 text-green-700 hover:bg-green-200",
  reaction: "bg-pink-100 text-pink-700 hover:bg-pink-200",
};

const DEFAULT_CHIP = "bg-gray-100 text-gray-700 hover:bg-gray-200";

export function CharacterPreview({ character }: CharacterPreviewProps) {
  const t = useT();
  const [ttsText, setTtsText] = useState("");
  const [synthesizing, setSynthesizing] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [avatarState, setAvatarState] = useState<"idle" | "thinking" | "talking">("idle");
  const [visemes, setVisemes] = useState<VisemeEntry[] | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [emotion, setEmotion] = useState<EmotionState | null>(null);
  const [motionClips, setMotionClips] = useState<MotionClipDef[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const audioNodesRef = useRef<AudioNodes | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [audioSampleRate, setAudioSampleRate] = useState(48000);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [seekEnabled, setSeekEnabled] = useState(false);

  // Load motion manifest
  useEffect(() => {
    fetch("/motions/manifest.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { clips: MotionClipDef[] } | null) => {
        if (data?.clips) setMotionClips(data.clips);
      })
      .catch(() => {});
  }, []);

  const categories = [...new Set(motionClips.map((c) => c.category))];
  const filteredClips = selectedCategory
    ? motionClips.filter((c) => c.category === selectedCategory)
    : motionClips;

  const activeClipDef = motionClips.find((c) => c.id === action);

  const handleAction = useCallback((clipId: string) => {
    setSeekEnabled(false);
    setSeekTime(null);
    // Clear then set to re-trigger even if same clip
    setAction(null);
    requestAnimationFrame(() => setAction(clipId));
  }, []);

  const handleEmotion = useCallback((type: EmotionType) => {
    setEmotion((prev) => {
      if (prev?.type === type) return null;
      return { type, intensity: 0.8 };
    });
  }, []);

  const handleTtsPreview = useCallback(async () => {
    if (!ttsText.trim() || synthesizing) return;
    setSynthesizing(true);
    setTtsError(null);
    setAvatarState("thinking");

    try {
      const result = await aituberApi.previewTts(character.id, ttsText.trim());

      const nodes = ensureAudioNodes(audioNodesRef.current);
      audioNodesRef.current = nodes;
      setAnalyserNode(nodes.analyser);
      setAudioSampleRate(nodes.context.sampleRate);

      const audioBuffer = await decodeBase64Audio(nodes.context, result.audio);

      setVisemes(result.visemes ?? null);
      setAvatarState("talking");

      const source = playAudioBuffer(nodes, audioBuffer);
      source.onended = () => {
        setAvatarState("idle");
        setVisemes(null);
      };
    } catch {
      setTtsError(t("aituber.characters.preview.ttsError"));
      setAvatarState("idle");
    } finally {
      setSynthesizing(false);
    }
  }, [ttsText, synthesizing, character.id, t]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">
          {t("aituber.characters.preview.title")}
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">{character.name}</p>
      </div>

      {/* VRM Viewer */}
      <div className="h-80 w-full bg-gray-900">
        <AituberAvatar
          avatarUrl={character.avatarUrl}
          avatarState={avatarState}
          audioAnalyser={analyserNode}
          audioSampleRate={audioSampleRate}
          visemes={visemes}
          emotion={emotion}
          action={action}
          seekTime={seekEnabled ? seekTime : null}
        />
      </div>

      {/* Seek bar */}
      {activeClipDef && (
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={seekEnabled}
                onChange={(e) => {
                  setSeekEnabled(e.target.checked);
                  if (!e.target.checked) setSeekTime(null);
                }}
              />
              Seek
            </label>
            <input
              type="range"
              min={0}
              max={activeClipDef.duration}
              step={0.01}
              value={seekTime ?? 0}
              onChange={(e) => {
                setSeekEnabled(true);
                setSeekTime(Number(e.target.value));
              }}
              className="flex-1"
              disabled={!seekEnabled}
            />
            <span className="text-xs font-mono text-gray-500 w-20 text-right">
              {(seekTime ?? 0).toFixed(2)}s / {activeClipDef.duration.toFixed(2)}s
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{activeClipDef.id}</p>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Motion picker */}
        {motionClips.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">
              {t("aituber.characters.preview.motions")}
            </p>
            {/* Category tabs */}
            <div className="flex flex-wrap gap-1 mb-2">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                  selectedCategory === null
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t("aituber.characters.preview.allCategories")}
              </button>
              {categories.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                    selectedCategory === cat
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {/* Clip buttons */}
            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
              {filteredClips.map((clip) => (
                <button
                  type="button"
                  key={clip.id}
                  onClick={() => handleAction(clip.id)}
                  title={clip.description}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                    CATEGORY_COLORS[clip.category] ?? DEFAULT_CHIP
                  }`}
                >
                  {clip.id}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Emotion picker */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">
            {t("aituber.characters.preview.emotions")}
          </p>
          <div className="flex flex-wrap gap-1">
            {EMOTIONS.map((emo) => (
              <button
                type="button"
                key={emo}
                onClick={() => handleEmotion(emo)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  emotion?.type === emo
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {emo}
              </button>
            ))}
          </div>
        </div>

        {/* TTS Test */}
        <div>
          <label
            className="mb-1 block text-sm font-medium text-gray-700"
            htmlFor="tts-preview-input"
          >
            {t("aituber.characters.preview.ttsLabel")}
          </label>
          <div className="flex gap-2">
            <input
              id="tts-preview-input"
              type="text"
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleTtsPreview();
              }}
              placeholder={t("aituber.characters.preview.ttsPlaceholder")}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              maxLength={200}
              disabled={synthesizing}
            />
            <button
              type="button"
              onClick={() => void handleTtsPreview()}
              disabled={synthesizing || !ttsText.trim() || avatarState === "talking"}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap"
            >
              {synthesizing
                ? t("aituber.characters.preview.synthesizing")
                : t("aituber.characters.preview.speak")}
            </button>
          </div>
          {ttsError && <p className="mt-1 text-xs text-red-600">{ttsError}</p>}
        </div>

        {/* Character info summary */}
        <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>{t("aituber.characters.languageCode")}</span>
            <span className="font-mono text-gray-900">{character.languageCode}</span>
          </div>
          {character.voiceName && (
            <div className="flex justify-between">
              <span>{t("aituber.characters.voiceName")}</span>
              <span className="font-mono text-gray-900">{character.voiceName}</span>
            </div>
          )}
          {character.speakingStyle && (
            <div className="flex justify-between">
              <span>{t("aituber.characters.speakingStyle")}</span>
              <span className="text-gray-900">{character.speakingStyle}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
