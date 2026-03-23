import { sendEmail } from "../../lib/email.js";
import { getUserById } from "../../repositories/user/user-repository.js";
import { getEmailSettings } from "../admin/admin-service.js";

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
        await sendEmail(
          {
            to: user.email,
            subject: `Recording ready: ${safeTitle}`,
            text: [
              `Hi ${user.name},`,
              "",
              `The recording of "${safeTitle}" is now available.`,
              "You can view or download it from the meeting detail page.",
            ].join("\n"),
          },
          "notification"
        );
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
