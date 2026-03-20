import nodemailer from "nodemailer";
import { getUserById } from "../../repositories/user/user-repository.js";
import { type EmailSettings, getEmailSettings } from "../admin/admin-service.js";

interface NotificationPayload {
  to: string;
  subject: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Generic email sender (extends email.ts pattern)
// ---------------------------------------------------------------------------

async function sendEmail(settings: EmailSettings, payload: NotificationPayload) {
  if (settings.provider === "resend" && settings.resendApiKey && settings.resendFrom) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: settings.resendFrom,
        to: [payload.to],
        subject: payload.subject,
        text: payload.body,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Resend delivery failed: ${response.status} ${text}`);
    }
    return;
  }

  if (settings.provider === "smtp" && settings.smtpHost && settings.smtpFrom) {
    const port = settings.smtpPort ?? 587;
    const transport = nodemailer.createTransport({
      host: settings.smtpHost,
      port,
      secure: settings.smtpSecure || port === 465,
      auth:
        settings.smtpUser && settings.smtpPass
          ? { user: settings.smtpUser, pass: settings.smtpPass }
          : undefined,
    });
    try {
      await transport.sendMail({
        from: settings.smtpFrom,
        to: payload.to,
        subject: payload.subject,
        text: payload.body,
      });
    } finally {
      transport.close();
    }
    return;
  }

  // No provider configured — log for development
  console.info("[notification]", JSON.stringify(payload));
}

// ---------------------------------------------------------------------------
// Notification: recording complete
// ---------------------------------------------------------------------------

export async function notifyRecordingComplete(
  _meetingId: string,
  meetingTitle: string,
  initiatedByUserId: string | null
) {
  try {
    const settings = await getEmailSettings();
    if (settings.provider === "none") return;

    // Notify the user who started the recording
    if (initiatedByUserId) {
      const user = await getUserById(initiatedByUserId);
      if (user?.email) {
        const safeTitle = meetingTitle
          .replace(/[\r\n\t]/g, " ")
          .slice(0, 100)
          .trim();
        await sendEmail(settings, {
          to: user.email,
          subject: `Recording ready: ${safeTitle}`,
          body: [
            `Hi ${user.name},`,
            "",
            `The recording of "${safeTitle}" is now available.`,
            "You can view or download it from the meeting detail page.",
          ].join("\n"),
        });
      }
    }
  } catch (error) {
    console.error("[notification] Failed to send recording-complete email:", error);
  }
}

// ---------------------------------------------------------------------------
// Notification: meeting started
// ---------------------------------------------------------------------------

export async function notifyMeetingStarted(
  _meetingId: string,
  meetingTitle: string,
  creatorId: string
) {
  try {
    const settings = await getEmailSettings();
    if (settings.provider === "none") return;

    const creator = await getUserById(creatorId);
    if (!creator) return;

    // For now, just log. In the future, this can notify invited participants.
    console.info(`[notification] Meeting "${meetingTitle}" started by ${creator.name}`);
  } catch (error) {
    console.error("[notification] Failed to send meeting-started notification:", error);
  }
}
