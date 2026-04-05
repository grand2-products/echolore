"use client";

import type { AituberCharacterDto } from "@echolore/shared/contracts";
import { useCallback, useRef, useState } from "react";
import { AituberAvatar } from "@/components/aituber/AituberAvatar";
import { aituberApi } from "@/lib/api/aituber";
import {
  type AudioNodes,
  decodeBase64Audio,
  ensureAudioNodes,
  playAudioBuffer,
} from "@/lib/audio-utils";
import { useT } from "@/lib/i18n";

interface CharacterPreviewProps {
  character: Pick<
    AituberCharacterDto,
    "id" | "name" | "avatarUrl" | "motionProfile" | "languageCode" | "voiceName" | "speakingStyle"
  >;
}

export function CharacterPreview({ character }: CharacterPreviewProps) {
  const t = useT();
  const [ttsText, setTtsText] = useState("");
  const [synthesizing, setSynthesizing] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const audioNodesRef = useRef<AudioNodes | null>(null);

  const handleTtsPreview = useCallback(async () => {
    if (!ttsText.trim() || synthesizing) return;
    setSynthesizing(true);
    setTtsError(null);

    try {
      const result = await aituberApi.previewTts(character.id, ttsText.trim());

      const nodes = ensureAudioNodes(audioNodesRef.current);
      audioNodesRef.current = nodes;

      const audioBuffer = await decodeBase64Audio(nodes.context, result.audio);
      playAudioBuffer(nodes, audioBuffer);
    } catch {
      setTtsError(t("aituber.characters.preview.ttsError"));
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
          motionProfileJson={character.motionProfile ?? null}
        />
      </div>

      <div className="p-4 space-y-4">
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
              disabled={synthesizing || !ttsText.trim()}
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
