import {
  getSiteSetting,
  upsertSiteSetting,
} from "../../repositories/admin/admin-repository.js";

export type EmailProvider = "none" | "resend" | "smtp";

export interface EmailSettings {
  provider: EmailProvider;
  resendApiKey: string | null;
  resendFrom: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFrom: string | null;
}

const EMAIL_SETTING_KEYS = [
  "emailProvider",
  "emailResendApiKey",
  "emailResendFrom",
  "emailSmtpHost",
  "emailSmtpPort",
  "emailSmtpSecure",
  "emailSmtpUser",
  "emailSmtpPass",
  "emailSmtpFrom",
] as const;

export async function getEmailSettings(): Promise<EmailSettings> {
  const entries = await Promise.all(
    EMAIL_SETTING_KEYS.map(async (key) => {
      const row = await getSiteSetting(key);
      return [key, row?.value ?? null] as const;
    }),
  );
  const map = Object.fromEntries(entries) as Record<string, string | null>;

  return {
    provider: (map.emailProvider as EmailProvider) || "none",
    resendApiKey: map.emailResendApiKey || null,
    resendFrom: map.emailResendFrom || null,
    smtpHost: map.emailSmtpHost || null,
    smtpPort: map.emailSmtpPort ? Number(map.emailSmtpPort) : null,
    smtpSecure: map.emailSmtpSecure !== "false",
    smtpUser: map.emailSmtpUser || null,
    smtpPass: map.emailSmtpPass || null,
    smtpFrom: map.emailSmtpFrom || null,
  };
}

export async function updateEmailSettings(input: Partial<EmailSettings>) {
  const keyMap: Record<string, string | undefined> = {
    emailProvider: input.provider,
    emailResendApiKey: input.resendApiKey ?? undefined,
    emailResendFrom: input.resendFrom ?? undefined,
    emailSmtpHost: input.smtpHost ?? undefined,
    emailSmtpPort: input.smtpPort != null ? String(input.smtpPort) : undefined,
    emailSmtpSecure: input.smtpSecure != null ? String(input.smtpSecure) : undefined,
    emailSmtpUser: input.smtpUser ?? undefined,
    emailSmtpPass: input.smtpPass ?? undefined,
    emailSmtpFrom: input.smtpFrom ?? undefined,
  };

  for (const [key, value] of Object.entries(keyMap)) {
    if (value !== undefined) {
      await upsertSiteSetting(key, value);
    }
  }

  return getEmailSettings();
}
