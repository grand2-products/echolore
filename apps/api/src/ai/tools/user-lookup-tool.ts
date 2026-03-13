import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getUserByEmail, getUserById } from "../../repositories/user/user-repository.js";

export function createUserLookupTool() {
  return new DynamicStructuredTool({
    name: "lookup_user",
    description:
      "Look up an internal user by email address or user ID. Returns basic profile information.",
    schema: z.object({
      email: z.string().optional().describe("Email address of the user to look up"),
      id: z.string().optional().describe("User ID of the user to look up"),
    }),
    func: async ({ email, id }) => {
      const user = email ? await getUserByEmail(email) : id ? await getUserById(id) : null;
      if (!user) {
        return "User not found.";
      }
      return `Name: ${user.name}, Email: ${user.email}, Role: ${user.role}`;
    },
  });
}
