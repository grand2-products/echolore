import { initLlmWithSettings } from "../llm/index.js";
import type { LlmProvider } from "./types.js";

export const defaultLlmProvider: LlmProvider = {
  init: initLlmWithSettings,
};
