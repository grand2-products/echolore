import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import {
  createAgentDefinition,
  listAvailableAgents,
  updateAgentDefinition,
} from "../../services/admin/admin-service.js";
import { createAgentSchema, updateAgentSchema } from "./schemas.js";

export const adminAgentRoutes = new Hono<AppEnv>();

adminAgentRoutes.get(
  "/agents",
  withErrorHandler(
    async (c) => {
      return c.json({ agents: await listAvailableAgents() });
    },
    "ADMIN_AGENTS_LIST_FAILED",
    "Failed to fetch agents"
  )
);

adminAgentRoutes.post(
  "/agents",
  zValidator("json", createAgentSchema),
  withErrorHandler(
    async (c) => {
      const data = c.req.valid("json");
      const user = c.get("user");

      const agent = await createAgentDefinition({
        ...data,
        createdBy: user.id,
      });
      return c.json({ agent }, 201);
    },
    "ADMIN_AGENT_CREATE_FAILED",
    "Failed to create agent"
  )
);

adminAgentRoutes.put(
  "/agents/:id",
  zValidator("json", updateAgentSchema),
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const data = c.req.valid("json");

      const agent = await updateAgentDefinition(id, data);
      if (!agent) return jsonError(c, 404, "ADMIN_AGENT_NOT_FOUND", "Agent not found");
      return c.json({ agent });
    },
    "ADMIN_AGENT_UPDATE_FAILED",
    "Failed to update agent"
  )
);
