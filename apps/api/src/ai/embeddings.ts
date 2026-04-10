import { GoogleAuth } from "google-auth-library";
import { getLlmSettings } from "../services/admin/llm-settings-service.js";

export type EmbeddingTaskType =
  | "RETRIEVAL_QUERY"
  | "RETRIEVAL_DOCUMENT"
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION";

interface EmbedTextOptions {
  taskType?: EmbeddingTaskType;
}

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2-preview";
const DEFAULT_EMBEDDING_DIMENSIONS = 768;

export async function isEmbeddingEnabled() {
  try {
    const settings = await getLlmSettings();
    if (settings.embeddingEnabled === false) return false;
    if (settings.embeddingProvider === "vertex") {
      return Boolean(settings.vertexProject);
    }
    return Boolean(settings.geminiApiKey);
  } catch {
    return false;
  }
}

export async function getEmbeddingConfig(): Promise<{ model: string; dimensions: number }> {
  try {
    const settings = await getLlmSettings();
    return {
      model: settings.embeddingModel || DEFAULT_EMBEDDING_MODEL,
      dimensions: DEFAULT_EMBEDDING_DIMENSIONS,
    };
  } catch {
    return { model: DEFAULT_EMBEDDING_MODEL, dimensions: DEFAULT_EMBEDDING_DIMENSIONS };
  }
}

export async function getEmbeddingModel() {
  const config = await getEmbeddingConfig();
  return config.model;
}

export function vectorToJson(values: number[]) {
  return JSON.stringify(values);
}

export function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => Number(v)).filter((v) => Number.isFinite(v));
      }
    } catch {
      return [];
    }
  }

  return [];
}

export async function embedText(
  text: string,
  options: EmbedTextOptions = {}
): Promise<number[] | null> {
  let settings: Awaited<ReturnType<typeof getLlmSettings>>;
  try {
    settings = await getLlmSettings();
  } catch {
    return null;
  }
  if (settings.embeddingEnabled === false) return null;

  if (settings.embeddingProvider === "vertex") {
    return embedTextVertex(text, options, settings);
  }
  return embedTextGemini(text, options, settings);
}

// ---------------------------------------------------------------------------
// Gemini API (API key auth)
// ---------------------------------------------------------------------------

interface GeminiEmbedSettings {
  geminiApiKey: string | null;
  embeddingModel: string | null;
}

async function embedTextGemini(
  text: string,
  options: EmbedTextOptions,
  settings: GeminiEmbedSettings
): Promise<number[] | null> {
  const apiKey = settings.geminiApiKey || null;
  if (!apiKey) return null;

  const model = settings.embeddingModel || DEFAULT_EMBEDDING_MODEL;
  const body = {
    model,
    content: {
      parts: [{ text }],
    },
    ...(options.taskType ? { taskType: options.taskType } : {}),
  };

  const response = await fetch(`${GEMINI_API_URL}/models/${model}:embedContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini embedding request failed: ${response.status} ${message}`);
  }

  const data = (await response.json()) as {
    embedding?: { values?: number[] };
  };

  const values = data.embedding?.values;
  if (!values || values.length === 0) return null;
  return values;
}

// ---------------------------------------------------------------------------
// Vertex AI (ADC / service account auth)
// ---------------------------------------------------------------------------

interface VertexEmbedSettings {
  vertexProject: string | null;
  vertexLocation: string | null;
  embeddingModel: string | null;
}

let vertexAuth: GoogleAuth | undefined;

function getVertexAuth(): GoogleAuth {
  if (!vertexAuth) {
    vertexAuth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }
  return vertexAuth;
}

async function embedTextVertex(
  text: string,
  options: EmbedTextOptions,
  settings: VertexEmbedSettings
): Promise<number[] | null> {
  const project = settings.vertexProject;
  if (!project) return null;

  const location = settings.vertexLocation || "asia-northeast1";
  const model = settings.embeddingModel || DEFAULT_EMBEDDING_MODEL;

  const auth = getVertexAuth();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!accessToken)
    throw new Error("Failed to obtain Google Cloud access token for Vertex AI embedding");

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:predict`;

  const body = {
    instances: [
      {
        content: text,
        ...(options.taskType ? { task_type: options.taskType } : {}),
      },
    ],
    parameters: {},
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Vertex AI embedding request failed: ${response.status} ${message}`);
  }

  const data = (await response.json()) as {
    predictions?: Array<{ embeddings?: { values?: number[] } }>;
  };

  const values = data.predictions?.[0]?.embeddings?.values;
  if (!values || values.length === 0) return null;

  return values;
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dot / denominator;
}
