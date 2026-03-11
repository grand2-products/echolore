export type EmbeddingTaskType =
  | "RETRIEVAL_QUERY"
  | "RETRIEVAL_DOCUMENT"
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION";

interface EmbedTextOptions {
  taskType?: EmbeddingTaskType;
  outputDimensionality?: number;
}

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";

export function isEmbeddingEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getEmbeddingModel() {
  return process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = getEmbeddingModel();
  const body = {
    model,
    content: {
      parts: [{ text }],
    },
    ...(options.taskType ? { taskType: options.taskType } : {}),
    ...(options.outputDimensionality
      ? { outputDimensionality: options.outputDimensionality }
      : {}),
  };

  const response = await fetch(
    `${GEMINI_API_URL}/models/${model}:embedContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

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
