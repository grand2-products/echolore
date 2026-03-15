import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv, SessionUser } from "../lib/auth.js";
import {
  authorizeAdminResource,
  authorizeOwnerResource,
  authorizeUserResource,
} from "./authorization-policy.js";

const { writeAuditLogMock } = vi.hoisted(() => ({
  writeAuditLogMock: vi.fn(),
}));

vi.mock("../lib/audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
  auditAction: vi.fn(),
  extractRequestMeta: vi.fn(() => ({ ipAddress: null, userAgent: null })),
}));

function createContext(user: SessionUser) {
  return {
    get(key: string) {
      if (key === "user") {
        return user;
      }
      return undefined;
    },
    req: {
      header(name: string) {
        if (name === "x-forwarded-for") return "127.0.0.1";
        if (name === "user-agent") return "vitest";
        return null;
      },
    },
  } as unknown as {
    get(key: "user"): SessionUser;
    req: { header(name: string): string | null };
  } & {
    req: AppEnv extends never ? never : { header(name: string): string | null };
  };
}

describe("authorization-policy", () => {
  beforeEach(() => {
    writeAuditLogMock.mockReset();
  });

  it("allows owner resource access for the owner and records an allowed audit log", async () => {
    const user: SessionUser = {
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.Member,
    };

    const result = await authorizeOwnerResource(
      createContext(user) as never,
      "meeting",
      "meeting_1",
      "user_1",
      "write"
    );

    expect(result).toEqual({ allowed: true, reason: "owner" });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user_1",
        action: "authz.allowed",
        resourceType: "meeting",
        resourceId: "meeting_1",
        metadata: expect.objectContaining({
          requiredAction: "write",
          reason: "owner",
        }),
      })
    );
  });

  it("denies deleting a user for non-admins", async () => {
    const user: SessionUser = {
      id: "user_1",
      email: "member@example.com",
      name: "Member",
      role: UserRole.Member,
    };

    const result = await authorizeUserResource(createContext(user) as never, "user_2", "delete");

    expect(result).toEqual({ allowed: false, reason: "admin-required" });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "authz.denied",
        resourceType: "user",
        resourceId: "user_2",
        metadata: expect.objectContaining({
          requiredAction: "delete",
          reason: "admin-required",
        }),
      })
    );
  });

  it("allows admin-only resources for admins", async () => {
    const user: SessionUser = {
      id: "admin_1",
      email: "admin@example.com",
      name: "Admin",
      role: UserRole.Admin,
    };

    const result = await authorizeAdminResource(
      createContext(user) as never,
      "/admin/groups",
      "read"
    );

    expect(result).toEqual({ allowed: true, reason: "admin" });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin_1",
        action: "authz.allowed",
        resourceType: "admin",
        resourceId: "/admin/groups",
      })
    );
  });
});
