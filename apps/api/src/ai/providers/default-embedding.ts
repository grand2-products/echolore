import {
  cosineSimilarity,
  embedText,
  getEmbeddingConfig,
  getEmbeddingModel,
  isEmbeddingEnabled,
} from "../embeddings.js";
import type { EmbeddingProvider } from "./types.js";

export const defaultEmbeddingProvider: EmbeddingProvider = {
  isAvailable: isEmbeddingEnabled,
  embed: embedText,
  getConfig: getEmbeddingConfig,
  getModel: getEmbeddingModel,
  cosineSimilarity,
};
