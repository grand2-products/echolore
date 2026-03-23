import nodemailer from "nodemailer";
import { type EmailSettings, getEmailSettings } from "../services/admin/admin-service.js";

export type { EmailSettings };

// --- Generic email transport ---

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

type SmtpConfig = {
  host: string;
  from: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string } | undefined;
};

type ResendConfig = {
  apiKey: string;
  from: string;
};

function buildSmtpConfig(settings: EmailSettings): SmtpConfig | null {
  if (!settings.smtpHost || !settings.smtpFrom) return null;

  const port = settings.smtpPort ?? 587;
  const secure = settings.smtpSecure || port === 465;

  return {
    host: settings.smtpHost,
    from: settings.smtpFrom,
    port,
    secure,
    auth:
      settings.smtpUser && settings.smtpPass
        ? { user: settings.smtpUser, pass: settings.smtpPass }
        : undefined,
  };
}

function buildResendConfig(settings: EmailSettings): ResendConfig | null {
  if (!settings.resendApiKey || !settings.resendFrom) return null;
  return { apiKey: settings.resendApiKey, from: settings.resendFrom };
}

async function sendWithResend(config: ResendConfig, msg: EmailMessage) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend delivery failed: ${response.status} ${body}`);
  }
}

async function sendWithSmtp(config: SmtpConfig, msg: EmailMessage) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  try {
    await transport.sendMail({
      from: config.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    });
  } finally {
    transport.close();
  }
}

/**
 * Send an email via the configured provider. Returns true if sent, false if
 * no provider is configured (falls back to console logging).
 */
export async function sendEmail(msg: EmailMessage, logTag = "EMAIL"): Promise<boolean> {
  const settings = await getEmailSettings();

  if (settings.provider === "resend") {
    const config = buildResendConfig(settings);
    if (config) {
      await sendWithResend(config, msg);
      return true;
    }
  }

  if (settings.provider === "smtp") {
    const config = buildSmtpConfig(settings);
    if (config) {
      await sendWithSmtp(config, msg);
      return true;
    }
  }

  // No provider configured — log to console for development
  console.info(`[${logTag}]`, JSON.stringify({ to: msg.to, subject: msg.subject }));
  return false;
}

// --- Domain-specific email helpers ---

type PasswordVerificationEmailInput = {
  email: string;
  verificationUrl: string;
  expiresAt: Date;
};

export async function sendPasswordVerificationEmail(input: PasswordVerificationEmailInput) {
  await sendEmail(
    {
      to: input.email,
      subject: "Verify your account",
      text: [
        "Complete your account verification.",
        `Verification link: ${input.verificationUrl}`,
        `This link expires at: ${input.expiresAt.toISOString()}`,
      ].join("\n"),
    },
    "AUTH_EMAIL_VERIFICATION"
  );
}

type InviteEmailInput = {
  email: string;
  inviteUrl: string;
  expiresAt: Date;
};

/**
 * Send an invitation email. Returns true if the email was sent, false if no
 * provider is configured (caller should show the invite link in the UI).
 */
export async function sendInviteEmail(input: InviteEmailInput): Promise<boolean> {
  return sendEmail(
    {
      to: input.email,
      subject: "You've been invited",
      text: [
        "You have been invited to join the team.",
        `Accept invitation: ${input.inviteUrl}`,
        `This link expires at: ${input.expiresAt.toISOString()}`,
      ].join("\n"),
    },
    "INVITE_EMAIL"
  );
}
