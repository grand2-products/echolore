import type {
  GoogleTokenExchangeRequest,
  PasswordRegistrationRequest,
  PasswordRegistrationResponse,
  SuccessResponse,
  TokenAuthResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from "@corp-internal/shared/contracts";
import { fetchApi } from "./fetch";
import type { AuthMeResponse } from "./types";

export const authApi = {
  me: () => fetchApi<AuthMeResponse>("/auth/me"),
  registrationStatus: () => fetchApi<{ open: boolean }>("/auth/registration-status"),
  register: (data: PasswordRegistrationRequest) =>
    fetchApi<PasswordRegistrationResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  verifyEmail: (data: VerifyEmailRequest) =>
    fetchApi<VerifyEmailResponse>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  exchangeGoogleToken: (data: GoogleTokenExchangeRequest) =>
    fetchApi<TokenAuthResponse>("/auth/token/google", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  logout: () =>
    fetchApi<SuccessResponse>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
