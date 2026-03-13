import nodemailer from "nodemailer";
import { getEmailSettings, type EmailSettings } from "../services/admin/admin-service.js";

type PasswordVerificationEmailInput = {
  email: string;
  verificationUrl: string;
  expiresAt: Date;
};

function buildSmtpConfig(settings: EmailSettings) {
  if (!settings.smtpHost || !settings.smtpFrom) return null;

  const port = settings.smtpPort ?? 587;
  const secure = settings.smtpSecure || port === 465;

  return {
    host: settings.smtpHost,
    from: settings.smtpFrom,
    port,
    secure,
    auth: settings.smtpUser && settings.smtpPass
      ? { user: settings.smtpUser, pass: settings.smtpPass }
      : undefined,
  };
}

function buildResendConfig(settings: EmailSettings) {
  if (!settings.resendApiKey || !settings.resendFrom) return null;
  return { apiKey: settings.resendApiKey, from: settings.resendFrom };
}

async function sendWithResend(
  config: { apiKey: string; from: string },
  input: PasswordVerificationEmailInput,
) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.email],
      subject: "Verify your account",
      text: [
        "Complete your account verification.",
        `Verification link: ${input.verificationUrl}`,
        `This link expires at: ${input.expiresAt.toISOString()}`,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend delivery failed: ${response.status} ${body}`);
  }
}

async function sendWithSmtp(
  config: ReturnType<typeof buildSmtpConfig> & {},
  input: PasswordVerificationEmailInput,
) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  await transport.sendMail({
    from: config.from,
    to: input.email,
    subject: "Verify your account",
    text: [
      "Complete your account verification.",
      `Verification link: ${input.verificationUrl}`,
      `This link expires at: ${input.expiresAt.toISOString()}`,
    ].join("\n"),
  });
}

export async function sendPasswordVerificationEmail(input: PasswordVerificationEmailInput) {
  const settings = await getEmailSettings();

  if (settings.provider === "resend") {
    const config = buildResendConfig(settings);
    if (config) {
      await sendWithResend(config, input);
      return;
    }
  }

  if (settings.provider === "smtp") {
    const config = buildSmtpConfig(settings);
    if (config) {
      await sendWithSmtp(config, input);
      return;
    }
  }

  // No provider configured — log to console for development
  console.info(
    "[AUTH_EMAIL_VERIFICATION]",
    JSON.stringify({
      email: input.email,
      verificationUrl: input.verificationUrl,
      expiresAt: input.expiresAt.toISOString(),
    }),
  );
}
