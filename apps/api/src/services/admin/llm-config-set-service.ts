import type { LlmConfigSet } from "../../db/schema.js";
import { decrypt, encrypt } from "../../lib/crypto.js";
import { getSiteSetting, upsertSiteSetting } from "../../repositories/admin/admin-repository.js";
import {
  countAgentsByConfigSetId,
  createConfigSet,
  deleteConfigSet as deleteConfigSetRepo,
  getConfigSetById as getConfigSetByIdRepo,
  listAllConfigSets,
  updateConfigSet,
} from "../../repositories/admin/llm-config-set-repository.js";

export const LLM_SECRET_FIELDS = ["geminiApiKey", "zhipuApiKey", "openaiCompatApiKey"] as const;

// ---------------------------------------------------------------------------
// Feature assignment keys in site_settings
// ---------------------------------------------------------------------------

export type LlmFeature = "aiChat" | "aituber" | "meetingAgent";

const FEATURE_SETTING_KEYS: Record<LlmFeature, string> = {
  aiChat: "llmConfigSetAiChat",
  aituber: "llmConfigSetAituber",
  meetingAgent: "llmConfigSetDefault",
};

// ---------------------------------------------------------------------------
// Cache (per config-set ID, 60 s TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: LlmConfigSet; expiresAt: number }>();

function invalidateCache(id?: string) {
  if (id) {
    cache.delete(id);
  } else {
    cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Helpers: encrypt/decrypt API key fields in-place
// ---------------------------------------------------------------------------

function decryptConfigSet(row: LlmConfigSet): LlmConfigSet {
  const out = { ...row };
  for (const field of LLM_SECRET_FIELDS) {
    const val = out[field];
    if (val) {
      try {
        out[field] = decrypt(val);
      } catch {
        out[field] = null;
      }
    }
  }
  return out;
}

function encryptFields(input: Partial<LlmConfigSet>): Partial<LlmConfigSet> {
  const out = { ...input };
  for (const field of LLM_SECRET_FIELDS) {
    const val = out[field];
    if (val && typeof val === "string") {
      out[field] = encrypt(val);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listConfigSets(): Promise<LlmConfigSet[]> {
  const rows = await listAllConfigSets();
  return rows.map(decryptConfigSet);
}

export async function getConfigSetById(id: string): Promise<LlmConfigSet | null> {
  const now = Date.now();
  const cached = cache.get(id);
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  const row = await getConfigSetByIdRepo(id);
  if (!row) return null;

  const decrypted = decryptConfigSet(row);
  cache.set(id, { data: decrypted, expiresAt: Date.now() + CACHE_TTL_MS });
  return decrypted;
}

export async function createLlmConfigSet(input: {
  id: string;
  name: string;
  provider: string;
  geminiApiKey?: string | null;
  geminiTextModel?: string | null;
  vertexProject?: string | null;
  vertexLocation?: string | null;
  vertexModel?: string | null;
  zhipuApiKey?: string | null;
  zhipuTextModel?: string | null;
  zhipuUseCodingPlan?: boolean;
  openaiCompatBaseUrl?: string | null;
  openaiCompatApiKey?: string | null;
  openaiCompatModel?: string | null;
}): Promise<LlmConfigSet | null> {
  const now = new Date();
  const encrypted = encryptFields(input);
  const row = await createConfigSet({
    id: input.id,
    name: input.name,
    provider: input.provider,
    geminiApiKey: (encrypted.geminiApiKey as string | null) ?? null,
    geminiTextModel: input.geminiTextModel ?? null,
    vertexProject: input.vertexProject ?? null,
    vertexLocation: input.vertexLocation ?? null,
    vertexModel: input.vertexModel ?? null,
    zhipuApiKey: (encrypted.zhipuApiKey as string | null) ?? null,
    zhipuTextModel: input.zhipuTextModel ?? null,
    zhipuUseCodingPlan: input.zhipuUseCodingPlan ?? false,
    openaiCompatBaseUrl: input.openaiCompatBaseUrl ?? null,
    openaiCompatApiKey: (encrypted.openaiCompatApiKey as string | null) ?? null,
    openaiCompatModel: input.openaiCompatModel ?? null,
    createdAt: now,
    updatedAt: now,
  });
  invalidateCache();
  return row ? decryptConfigSet(row) : null;
}

export async function updateLlmConfigSet(
  id: string,
  input: Partial<{
    name: string;
    provider: string;
    geminiApiKey: string | null;
    geminiTextModel: string | null;
    vertexProject: string | null;
    vertexLocation: string | null;
    vertexModel: string | null;
    zhipuApiKey: string | null;
    zhipuTextModel: string | null;
    zhipuUseCodingPlan: boolean;
    openaiCompatBaseUrl: string | null;
    openaiCompatApiKey: string | null;
    openaiCompatModel: string | null;
  }>
): Promise<LlmConfigSet | null> {
  const encrypted = encryptFields(input);
  const row = await updateConfigSet(id, { ...encrypted, updatedAt: new Date() });
  invalidateCache(id);
  return row ? decryptConfigSet(row) : null;
}

export interface ConfigSetDeleteResult {
  ok: boolean;
  reason?: string;
}

export async function deleteLlmConfigSet(id: string): Promise<ConfigSetDeleteResult> {
  // Check references in parallel
  const [featureRefs, agentCount] = await Promise.all([
    Promise.all(
      Object.entries(FEATURE_SETTING_KEYS).map(async ([feature, settingKey]) => {
        const row = await getSiteSetting(settingKey);
        return row?.value === id ? feature : null;
      })
    ),
    countAgentsByConfigSetId(id),
  ]);

  const referencingFeature = featureRefs.find(Boolean);
  if (referencingFeature) {
    return { ok: false, reason: `Referenced by feature: ${referencingFeature}` };
  }
  if (agentCount > 0) {
    return { ok: false, reason: `Referenced by ${agentCount} agent(s)` };
  }

  const deleted = await deleteConfigSetRepo(id);
  if (!deleted) {
    return { ok: false, reason: "Config set not found" };
  }
  invalidateCache(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Feature assignments
// ---------------------------------------------------------------------------

export interface ConfigSetAssignments {
  aiChat: string;
  aituber: string;
  meetingAgent: string;
}

export async function getConfigSetAssignments(): Promise<ConfigSetAssignments> {
  const entries = await Promise.all(
    Object.entries(FEATURE_SETTING_KEYS).map(async ([feature, key]) => {
      const row = await getSiteSetting(key);
      return [feature, row?.value ?? "default"] as const;
    })
  );
  return Object.fromEntries(entries) as unknown as ConfigSetAssignments;
}

export async function updateConfigSetAssignments(
  input: Partial<ConfigSetAssignments>
): Promise<ConfigSetAssignments> {
  for (const [feature, configSetId] of Object.entries(input)) {
    const settingKey = FEATURE_SETTING_KEYS[feature as LlmFeature];
    if (settingKey && configSetId) {
      // Validate that the config set exists
      const exists = await getConfigSetByIdRepo(configSetId);
      if (!exists) {
        throw new Error(`Config set not found: ${configSetId}`);
      }
      await upsertSiteSetting(settingKey, configSetId);
    }
  }
  return getConfigSetAssignments();
}

// ---------------------------------------------------------------------------
// Resolve a config set for a given feature (used by LLM init)
// ---------------------------------------------------------------------------

export async function resolveConfigSetForFeature(
  feature: LlmFeature
): Promise<LlmConfigSet | null> {
  const settingKey = FEATURE_SETTING_KEYS[feature];
  const row = await getSiteSetting(settingKey);
  const configSetId = row?.value ?? "default";
  return getConfigSetById(configSetId);
}
