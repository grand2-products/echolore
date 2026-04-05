"use client";

import { useParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { CharacterEditForm } from "../CharacterEditForm";
import { CharacterPageLayout } from "../CharacterPageLayout";
import { CharacterPreview } from "../CharacterPreview";
import { useCharacterForm } from "../use-character-form";

export default function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const {
    form,
    saving,
    loading,
    avatarUrl,
    error,
    message,
    setAvatarFile,
    motionProfile,
    setMotionProfile,
    setError,
    updateField,
    handleSave,
    handleCancel,
  } = useCharacterForm(id);

  if (loading) {
    return (
      <CharacterPageLayout title={t("aituber.characters.edit")} error={null} message={null}>
        <p className="text-gray-500">{t("common.status.loading")}</p>
      </CharacterPageLayout>
    );
  }

  return (
    <CharacterPageLayout title={t("aituber.characters.edit")} error={error} message={message}>
      <div className="grid gap-6 lg:grid-cols-2">
        <CharacterEditForm
          isNew={false}
          form={form}
          saving={saving}
          avatarUrl={avatarUrl}
          onUpdateField={updateField}
          onAvatarFileChange={setAvatarFile}
          onMotionProfileChange={setMotionProfile}
          onSave={() => void handleSave()}
          onCancel={handleCancel}
          onError={setError}
        />

        {avatarUrl && (
          <CharacterPreview
            character={{
              id,
              name: form.name,
              avatarUrl,
              motionProfile: motionProfile,
              languageCode: form.languageCode,
              voiceName: form.voiceName || null,
              speakingStyle: form.speakingStyle || null,
            }}
          />
        )}
      </div>
    </CharacterPageLayout>
  );
}
