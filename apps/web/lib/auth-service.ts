import { authApi, usersApi } from "./api";

export const authService = {
  getCurrentAuth: () => authApi.me(),
  listSessions: () => usersApi.listAuthSessions(),
  revokeSession: (sessionId: string) => usersApi.revokeAuthSession(sessionId),
  loginWithPassword: (input: { email: string; password: string }) => authApi.login(input),
  registerWithPassword: (input: { name: string; email: string; password: string }) =>
    authApi.register(input),
  verifyEmailToken: (token: string) => authApi.verifyEmail({ token }),
};
