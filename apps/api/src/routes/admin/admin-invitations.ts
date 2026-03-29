import type { UserInvitationDto } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import { writeAuditLog } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/auth.js";
import { sendInviteEmail } from "../../lib/email.js";
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from "../../services/admin/invitation-service.js";

const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).optional(),
  groupIds: z.array(z.string()).optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

export const adminInvitationRoutes = new Hono<AppEnv>();

type InvitationRaw = {
  id: string;
  email: string;
  role: string;
  group_ids: string[];
  invited_by_user_id: string | null;
  invitedByEmail?: string | null;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

function toInvitationDto(inv: InvitationRaw): UserInvitationDto {
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role === "admin" ? "admin" : "member",
    groupIds: inv.group_ids,
    invitedByUserId: inv.invited_by_user_id,
    invitedByEmail: inv.invitedByEmail ?? null,
    expiresAt: inv.expires_at.toISOString(),
    usedAt: inv.used_at?.toISOString() ?? null,
    revokedAt: inv.revoked_at?.toISOString() ?? null,
    createdAt: inv.created_at.toISOString(),
  };
}

adminInvitationRoutes.post(
  "/invitations",
  zValidator("json", createInvitationSchema),
  withErrorHandler("ADMIN_INVITATION_CREATE_FAILED", "Failed to create invitation"),
  async (c): Promise<Response> => {
    const data = c.req.valid("json");
    const sessionUser = c.get("user");

    try {
      const { invitation, token } = await createInvitation({
        ...data,
        invitedByUserId: sessionUser.id,
      });

      // Build invite URL using configured base URL or request origin
      const proto = c.req.header("x-forwarded-proto") ?? "http";
      const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "localhost";
      const origin = process.env.APP_BASE_URL || `${proto}://${host}`;
      const inviteUrl = `${origin}/invite/${token}`;

      // Try to send email
      let emailSent = false;
      try {
        emailSent = await sendInviteEmail({
          email: invitation.email,
          inviteUrl,
          expiresAt: invitation.expires_at,
        });
      } catch (emailError) {
        console.error("[INVITE_EMAIL_ERROR]", emailError);
      }

      await writeAuditLog({
        actorUserId: sessionUser.id,
        actorEmail: sessionUser.email,
        action: "admin.invitation.created",
        resourceType: "user_invitation",
        resourceId: invitation.id,
        metadata: { email: invitation.email, role: invitation.role, emailSent },
      });

      return c.json(
        {
          invitation: toInvitationDto(invitation),
          inviteUrl,
          emailSent,
        },
        201
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create invitation";
      if (message.includes("already exists") || message.includes("active invitation")) {
        return jsonError(c, 409, "INVITATION_CONFLICT", message);
      }
      throw error;
    }
  }
);

adminInvitationRoutes.get(
  "/invitations",
  withErrorHandler("ADMIN_INVITATIONS_LIST_FAILED", "Failed to list invitations"),
  async (c): Promise<Response> => {
    const invitations = await listInvitations();
    return c.json({
      invitations: invitations.map(toInvitationDto),
    });
  }
);

adminInvitationRoutes.delete(
  "/invitations/:id",
  withErrorHandler("ADMIN_INVITATION_REVOKE_FAILED", "Failed to revoke invitation"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    const sessionUser = c.get("user");

    const revoked = await revokeInvitation(id);
    if (!revoked) {
      return jsonError(
        c,
        404,
        "INVITATION_NOT_FOUND",
        "Invitation not found or already used/revoked"
      );
    }

    await writeAuditLog({
      actorUserId: sessionUser.id,
      actorEmail: sessionUser.email,
      action: "admin.invitation.revoked",
      resourceType: "user_invitation",
      resourceId: id,
      metadata: { email: revoked.email },
    });

    return c.json({ success: true as const });
  }
);
