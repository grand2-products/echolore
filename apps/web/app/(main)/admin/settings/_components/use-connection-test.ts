"use client";

import { useState } from "react";
import { useApiErrorMessage } from "@/lib/api-error-message";
import type { TestModalState } from "./TestConnectionModal";

interface UseConnectionTestOptions {
  /** モーダルのタイトル（テスト中・成功・失敗で共通） */
  title: string;
  /** 接続テストを実行する非同期関数。成功メッセージを返す */
  test: () => Promise<{ ok: boolean; message: string; error?: string }>;
  /** SettingsForm の setError */
  setError: (error: string | null) => void;
  /** SettingsForm の setNotice */
  setNotice: (notice: string | null) => void;
  /** TestConnectionModal を開く関数 */
  onTestModal: (modal: TestModalState | null) => void;
  /** テスト中のボタンラベル用テキスト */
  testingMessage: string;
  /** テスト失敗時のフォールバックメッセージ */
  failMessage: string;
}

interface UseConnectionTestResult {
  testing: boolean;
  handleTest: () => Promise<void>;
}

/**
 * 接続テストの共通ロジック（try/catch/finally パターン）を抽象化するフック。
 * LlmSettingsSection・StorageSettingsSection など、接続テストボタンを持つ
 * Settings Section で使用する。
 */
export function useConnectionTest({
  title,
  test,
  setError,
  setNotice,
  onTestModal,
  testingMessage,
  failMessage,
}: UseConnectionTestOptions): UseConnectionTestResult {
  const getApiErrorMessage = useApiErrorMessage();
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setNotice(null);
    onTestModal({
      title,
      status: "loading",
      message: testingMessage,
    });
    try {
      const result = await test();
      if (result.ok) {
        onTestModal({
          title,
          status: "success",
          message: result.message,
        });
      } else {
        onTestModal({
          title,
          status: "error",
          message: result.error ?? failMessage,
        });
      }
    } catch (testError) {
      onTestModal({
        title,
        status: "error",
        message: getApiErrorMessage(testError, failMessage),
      });
    } finally {
      setTesting(false);
    }
  };

  return { testing, handleTest };
}
