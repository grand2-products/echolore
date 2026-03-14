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
    systemPrompt: input.systemPrompt,
    voiceProfile: input.voiceProfile ?? null,
    interventionStyle: input.interventionStyle,
    defaultProvider: input.defaultProvider,
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
    ...input,
    updatedAt: new Date(),
  });
}
