import nodemailer from "nodemailer";

type PasswordVerificationEmailInput = {
  email: string;
  verificationUrl: string;
  expiresAt: Date;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT || "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  return {
    host,
    from,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  };
}

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    return null;
  }

  return {
    apiKey,
    from,
    audience: process.env.RESEND_AUDIENCE?.trim() || undefined,
  };
}

async function sendWithResend(input: PasswordVerificationEmailInput) {
  const resend = getResendConfig();
  if (!resend) {
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resend.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resend.from,
      to: [input.email],
      subject: "Verify your corp-internal account",
      text: [
        "Complete your account verification.",
        `Verification link: ${input.verificationUrl}`,
        `This link expires at: ${input.expiresAt.toISOString()}`,
      ].join("\n"),
      tags: resend.audience ? [{ name: "audience", value: resend.audience }] : undefined,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend delivery failed: ${response.status} ${body}`);
  }

  return true;
}

async function sendWithSmtp(input: PasswordVerificationEmailInput) {
  const smtp = getSmtpConfig();
  if (!smtp) {
    return false;
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.auth,
  });

  await transport.sendMail({
    from: smtp.from,
    to: input.email,
    subject: "Verify your corp-internal account",
    text: [
      "Complete your account verification.",
      `Verification link: ${input.verificationUrl}`,
      `This link expires at: ${input.expiresAt.toISOString()}`,
    ].join("\n"),
  });

  return true;
}

export async function sendPasswordVerificationEmail(input: PasswordVerificationEmailInput) {
  if (await sendWithResend(input)) {
    return;
  }

  if (await sendWithSmtp(input)) {
    return;
  }

    console.info(
      "[AUTH_EMAIL_VERIFICATION]",
      JSON.stringify({
        email: input.email,
        verificationUrl: input.verificationUrl,
        expiresAt: input.expiresAt.toISOString(),
      })
    );
}
