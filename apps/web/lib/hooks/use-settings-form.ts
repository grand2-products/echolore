import { useCallback, useEffect, useState } from "react";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useStableEvent } from "@/lib/hooks/use-stable-event";
import { useT } from "@/lib/i18n";

interface UseSettingsFormOptions<T> {
  load: () => Promise<T>;
  save: () => Promise<void>;
  onLoaded?: (data: T) => void;
  onSaved?: () => void;
}

export function useSettingsForm<T>(options: UseSettingsFormOptions<T>) {
  const { load, save, onLoaded, onSaved } = options;
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSettings = useStableEvent(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await load();
      onLoaded?.(data);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t("admin.settings.loadError")));
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await save();
      setNotice(t("admin.settings.updated"));
      onSaved?.();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setSaving(false);
    }
  }, [save, onSaved, getApiErrorMessage, t]);

  return {
    loading,
    saving,
    error,
    notice,
    loadSettings,
    handleSave,
    setError,
    setNotice,
  };
}
