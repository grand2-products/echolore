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
  llmConfigSetId?: string | null;
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
    systemPrompt: input.systemPrompt,
    voiceProfile: input.voiceProfile ?? null,
    interventionStyle: input.interventionStyle,
    defaultProvider: input.defaultProvider,
    llmConfigSetId: input.llmConfigSetId ?? null,
    isActive: input.isActive ?? true,
    autonomousEnabled: input.autonomousEnabled ?? false,
    autonomousCooldownSec: input.autonomousCooldownSec ?? 120,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
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
    llmConfigSetId?: string | null;
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
    ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
    ...(input.voiceProfile !== undefined ? { voiceProfile: input.voiceProfile } : {}),
    ...(input.interventionStyle !== undefined
      ? { interventionStyle: input.interventionStyle }
      : {}),
    ...(input.defaultProvider !== undefined ? { defaultProvider: input.defaultProvider } : {}),
    ...(input.llmConfigSetId !== undefined ? { llmConfigSetId: input.llmConfigSetId } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.autonomousEnabled !== undefined
      ? { autonomousEnabled: input.autonomousEnabled }
      : {}),
    ...(input.autonomousCooldownSec !== undefined
      ? { autonomousCooldownSec: input.autonomousCooldownSec }
      : {}),
    updatedAt: new Date(),
  });
}
