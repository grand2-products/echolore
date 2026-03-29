import type { AuthConfig } from "@auth/core";
import Credentials from "@auth/core/providers/credentials";
import Google from "@auth/core/providers/google";
import { UserRole } from "@echolore/shared/contracts";
import { db } from "../db/index.js";
import { getAuthSettings, resolveAllowedDomain } from "../services/admin/auth-settings-service.js";
import { isRegistrationOpen } from "../services/auth/auth-utils.js";
import { reconcileGoogleIdentity } from "../services/auth/oauth-service.js";
import { authenticatePasswordUser } from "../services/auth/password-service.js";

const AUTH_SECRET = process.env.AUTH_SECRET;

async function resolveGoogleCredentials(): Promise<{
  clientId: string | undefined;
  clientSecret: string | undefined;
}> {
  try {
    const settings = await getAuthSettings();
    return {
      clientId: settings.googleClientId || undefined,
      clientSecret: settings.googleClientSecret || undefined,
    };
  } catch {
    return { clientId: undefined, clientSecret: undefined };
  }
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const googleCreds = await resolveGoogleCredentials();
  return {
    secret: AUTH_SECRET,
    trustHost: true,
    basePath: "/api/auth",
    pages: {
      signIn: "/login",
    },
    session: {
      strategy: "jwt",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    providers: [
      Google({
        clientId: googleCreds.clientId,
        clientSecret: googleCreds.clientSecret,
      }),
      Credentials({
        name: "password",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const email = credentials?.email;
          const password = credentials?.password;
          if (typeof email !== "string" || typeof password !== "string") {
            return null;
          }
          const user = await authenticatePasswordUser(email, password);
          if (!user) return null;
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            avatarUrl: user.avatarUrl ?? null,
          };
        },
      }),
    ],
    callbacks: {
      async signIn({ user, account }) {
        if (account?.provider === "google") {
          const email = user.email;
          if (!email) return false;
          const [, domain = ""] = email.toLowerCase().split("@");
          const allowedDomain = await resolveAllowedDomain();
          if (allowedDomain && domain !== allowedDomain) return false;
          // Block new Google users when registration is closed
          const existing = await db
            .selectFrom("users")
            .select(["id", "suspendedAt", "deletedAt"])
            .where("email", "=", email.trim().toLowerCase())
            .executeTakeFirst();
          if (existing?.suspendedAt || existing?.deletedAt) return false;
          if (!existing && !(await isRegistrationOpen())) return false;
          // Reconciliation happens in the jwt callback only to avoid
          // a race condition with duplicate user creation.
        }
        return true;
      },
      async jwt({ token, user, account }) {
        if (user) {
          // Initial sign-in: embed user info into the JWT
          if (account?.provider === "google") {
            const userEmail = user.email ?? "";
            const reconciledUser = await reconcileGoogleIdentity({
              email: userEmail,
              name: user.name || userEmail.split("@")[0] || "User",
            });
            token.userId = reconciledUser.id;
            token.role = reconciledUser.role;
            token.avatarUrl = reconciledUser.avatarUrl ?? null;
            token.authMode = "sso";
          } else {
            // Credentials provider
            token.userId = user.id;
            token.role = (user as { role?: string }).role ?? UserRole.Member;
            token.avatarUrl = (user as { avatarUrl?: string | null }).avatarUrl ?? null;
            token.authMode = "password";
          }
        }
        return token;
      },
      async session({ session, token }) {
        if (token && session.user) {
          session.user.id = token.userId as string;
          const user = session.user as unknown as Record<string, unknown>;
          user.role = token.role as string;
          user.avatarUrl = token.avatarUrl as string | null;
          user.authMode = token.authMode as string;
        }
        return session;
      },
    },
  };
}
