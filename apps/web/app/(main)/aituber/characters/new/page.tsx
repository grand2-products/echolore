"use client";

import { useT } from "@/lib/i18n";
import { CharacterEditForm } from "../CharacterEditForm";
import { CharacterPageLayout } from "../CharacterPageLayout";
import { useCharacterForm } from "../use-character-form";

export default function CharacterNewPage() {
  const t = useT();
  const {
    form,
    saving,
    error,
    message,
    setAvatarFile,
    setMotionProfile,
    setError,
    updateField,
    handleSave,
    handleCancel,
  } = useCharacterForm("new");

  return (
    <CharacterPageLayout
      title={t("aituber.characters.create")}
      error={error}
      message={message}
      narrow
    >
      <CharacterEditForm
        isNew
        form={form}
        saving={saving}
        avatarUrl={null}
        onUpdateField={updateField}
        onAvatarFileChange={setAvatarFile}
        onMotionProfileChange={setMotionProfile}
        onSave={() => void handleSave()}
        onCancel={handleCancel}
        onError={setError}
      />
    </CharacterPageLayout>
  );
}
