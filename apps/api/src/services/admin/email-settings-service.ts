import { createSettingsCache } from "./create-settings-cache.js";

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

const cache = createSettingsCache<EmailSettings>({
  keys: [
    "emailProvider",
    "emailResendApiKey",
    "emailResendFrom",
    "emailSmtpHost",
    "emailSmtpPort",
    "emailSmtpSecure",
    "emailSmtpUser",
    "emailSmtpPass",
    "emailSmtpFrom",
  ],
  cacheTtlMs: false,
  mapToSettings: (map) => ({
    provider: (map.emailProvider as EmailProvider) || "none",
    resendApiKey: map.emailResendApiKey || null,
    resendFrom: map.emailResendFrom || null,
    smtpHost: map.emailSmtpHost || null,
    smtpPort: map.emailSmtpPort ? Number(map.emailSmtpPort) : null,
    smtpSecure: map.emailSmtpSecure !== "false",
    smtpUser: map.emailSmtpUser || null,
    smtpPass: map.emailSmtpPass || null,
    smtpFrom: map.emailSmtpFrom || null,
  }),
  mapToKeyValues: (input) => ({
    emailProvider: input.provider,
    emailResendApiKey: input.resendApiKey ?? undefined,
    emailResendFrom: input.resendFrom ?? undefined,
    emailSmtpHost: input.smtpHost ?? undefined,
    emailSmtpPort: input.smtpPort != null ? String(input.smtpPort) : undefined,
    emailSmtpSecure: input.smtpSecure != null ? String(input.smtpSecure) : undefined,
    emailSmtpUser: input.smtpUser ?? undefined,
    emailSmtpPass: input.smtpPass ?? undefined,
    emailSmtpFrom: input.smtpFrom ?? undefined,
  }),
});

export const getEmailSettings = cache.get;
export const updateEmailSettings = cache.update;
