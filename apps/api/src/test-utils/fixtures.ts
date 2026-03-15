import { UserRole } from "@echolore/shared/contracts";
import type { SessionUser } from "../lib/auth.js";

export function memberUser(overrides?: Partial<SessionUser>): SessionUser {
  return {
    id: "user_1",
    email: "member@example.com",
    name: "Member",
    role: UserRole.Member,
    avatarUrl: null,
    ...overrides,
  };
}

export function adminUser(overrides?: Partial<SessionUser>): SessionUser {
  return {
    id: "admin_1",
    email: "admin@example.com",
    name: "Admin",
    role: UserRole.Admin,
    avatarUrl: null,
    ...overrides,
  };
}
