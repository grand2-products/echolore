import {
  createAgent,
  getAgentById,
  listActiveAgents,
  updateAgent,
} from "../../repositories/meeting/meeting-realtime-repository.js";

export async function listAvailableAgents() {
  return listActiveAgents();
}

export async function createAgentDefinition(input: {
  name: string;
  description?: string | null;
  systemPrompt: string;
  voiceProfile?: string | null;
  interventionStyle: string;
  defaultProvider: string;
  isActive?: boolean;
  autonomousEnabled?: boolean;
  autonomousCooldownSec?: number;
  createdBy: string;
}) {
  const now = new Date();
  return createAgent({
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description ?? null,
    system_prompt: input.systemPrompt,
    voice_profile: input.voiceProfile ?? null,
    intervention_style: input.interventionStyle,
    default_provider: input.defaultProvider,
    is_active: input.isActive ?? true,
    autonomous_enabled: input.autonomousEnabled ?? false,
    autonomous_cooldown_sec: input.autonomousCooldownSec ?? 120,
    created_by: input.createdBy,
    created_at: now,
    updated_at: now,
  });
}

export async function updateAgentDefinition(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    systemPrompt?: string;
    voiceProfile?: string | null;
    interventionStyle?: string;
    defaultProvider?: string;
    isActive?: boolean;
    autonomousEnabled?: boolean;
    autonomousCooldownSec?: number;
  }
) {
  const agent = await getAgentById(id);
  if (!agent) {
    return null;
  }

  return updateAgent(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.systemPrompt !== undefined ? { system_prompt: input.systemPrompt } : {}),
    ...(input.voiceProfile !== undefined ? { voice_profile: input.voiceProfile } : {}),
    ...(input.interventionStyle !== undefined
      ? { intervention_style: input.interventionStyle }
      : {}),
    ...(input.defaultProvider !== undefined ? { default_provider: input.defaultProvider } : {}),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    ...(input.autonomousEnabled !== undefined
      ? { autonomous_enabled: input.autonomousEnabled }
      : {}),
    ...(input.autonomousCooldownSec !== undefined
      ? { autonomous_cooldown_sec: input.autonomousCooldownSec }
      : {}),
    updated_at: new Date(),
  });
}
