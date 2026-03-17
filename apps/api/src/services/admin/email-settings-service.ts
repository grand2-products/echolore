import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";

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

const cache = createTypedSettingsService(
  {
    provider: field("emailProvider", FieldCodecs.withDefault<EmailProvider>("none")),
    resendApiKey: field("emailResendApiKey", FieldCodecs.nullable),
    resendFrom: field("emailResendFrom", FieldCodecs.nullable),
    smtpHost: field("emailSmtpHost", FieldCodecs.nullable),
    smtpPort: field("emailSmtpPort", FieldCodecs.nullableNumber),
    smtpSecure: field("emailSmtpSecure", FieldCodecs.boolFalse),
    smtpUser: field("emailSmtpUser", FieldCodecs.nullable),
    smtpPass: field("emailSmtpPass", FieldCodecs.nullable),
    smtpFrom: field("emailSmtpFrom", FieldCodecs.nullable),
  },
  { cacheTtlMs: false }
);

export const getEmailSettings = cache.get;
export const updateEmailSettings = cache.update;
