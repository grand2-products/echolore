import type { AuthConfig } from "@auth/core";
import Google from "@auth/core/providers/google";
import Credentials from "@auth/core/providers/credentials";
import { UserRole } from "@corp-internal/shared/contracts";
import {
  authenticatePasswordUser,
  isRegistrationOpen,
  reconcileGoogleIdentity,
} from "../services/auth/password-auth-service.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const ALLOWED_DOMAIN = (
  process.env.AUTH_ALLOWED_DOMAIN || "grand2-products.com"
).toLowerCase();

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.AUTH_SESSION_SECRET;

export function getAuthConfig(): AuthConfig {
  return {
    secret: AUTH_SECRET,
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
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
          if (domain !== ALLOWED_DOMAIN) return false;
          // Block new Google users when registration is closed
          const [existing] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, email.trim().toLowerCase()));
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
            const reconciledUser = await reconcileGoogleIdentity({
              email: user.email!,
              name: user.name || user.email!.split("@")[0] || "User",
            });
            token.userId = reconciledUser.id;
            token.role = reconciledUser.role;
            token.avatarUrl = reconciledUser.avatarUrl ?? null;
            token.authMode = "sso";
          } else {
            // Credentials provider
            token.userId = user.id;
            token.role = (user as { role?: string }).role ?? UserRole.Member;
            token.avatarUrl =
              (user as { avatarUrl?: string | null }).avatarUrl ?? null;
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
