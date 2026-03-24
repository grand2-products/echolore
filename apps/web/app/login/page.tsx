"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { appTitle } from "@/lib/app-config";
import { useAuthContext } from "@/lib/auth-context";
import { useAuthActions } from "@/lib/hooks/use-auth-actions";
import { usePasswordAuth } from "@/lib/hooks/use-password-auth";
import { usePublicSiteSettings } from "@/lib/hooks/use-public-site-settings";
import { useRegistrationStatus } from "@/lib/hooks/use-registration-status";
import { useT } from "@/lib/i18n";
import { normalizeReturnTo } from "@/lib/return-to";

type AuthView = "signin" | "register";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
          Loading...
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const { user, isLoading: authLoading } = useAuthContext();
  const returnTo = normalizeReturnTo(searchParams.get("returnTo"));
  const { googleSignIn } = useAuthActions({ returnTo });
  const { signIn, register, verifyEmail } = usePasswordAuth();
  const getApiErrorMessage = useApiErrorMessage();

  const { data: regStatus } = useRegistrationStatus();
  const { data: siteSettings } = usePublicSiteSettings();

  const registrationOpen = regStatus?.open ?? false;
  const googleOAuthEnabled = siteSettings?.googleOAuthEnabled ?? false;
  const siteTitle = siteSettings?.siteTitle || appTitle;

  const [view, setView] = useState<AuthView>("signin");
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Redirect authenticated users
  useEffect(() => {
    if (user) {
      router.replace(returnTo ?? "/");
    }
  }, [returnTo, router, user]);

  // Handle email verification token
  useEffect(() => {
    const token = searchParams.get("verify");
    if (!token) return;

    let cancelled = false;
    setIsVerifying(true);
    setError(null);
    setMessage(t("login.verifyInProgress"));

    void verifyEmail(token, returnTo)
      .then(() => {
        if (cancelled) return;
        setMessage(t("login.verifySuccess"));
      })
      .catch((verifyError: unknown) => {
        if (cancelled) return;
        setError(getApiErrorMessage(verifyError, t("login.verifyError")));
        setMessage(null);
      })
      .finally(() => {
        if (!cancelled) setIsVerifying(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getApiErrorMessage, returnTo, searchParams, t, verifyEmail]);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await signIn({ email: signinEmail, password: signinPassword }, returnTo);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, t("login.signInError")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const result = await register(
        { name: registerName, email: registerEmail, password: registerPassword },
        returnTo
      );
      if (result.immediate) return;
      setMessage(t("login.registerStarted"));
      setView("signin");
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, t("login.registerError")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchView = (next: AuthView) => {
    setView(next);
    setError(null);
    setMessage(null);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        {t("common.status.loading")}
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">{siteTitle}</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          {view === "signin" ? t("login.titleSignin") : t("login.titleRegister")}
        </h1>
        {googleOAuthEnabled ? (
          <p className="mt-2 text-sm text-slate-600">{t("login.intro")}</p>
        ) : null}

        {registrationOpen ? (
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchView("signin")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                view === "signin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {t("login.tabSignin")}
            </button>
            <button
              type="button"
              onClick={() => switchView("register")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                view === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {t("login.tabRegister")}
            </button>
          </div>
        ) : null}

        {googleOAuthEnabled ? (
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => void googleSignIn()}
              className="block w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("login.continueGoogle")}
            </button>
          </div>
        ) : null}

        {message ? (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {view === "signin" || !registrationOpen ? (
          <form onSubmit={handleSignIn} className="mt-6 space-y-4 border-t border-slate-200 pt-6">
            <div>
              <label
                htmlFor="signin-email"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {t("login.email")}
              </label>
              <input
                id="signin-email"
                type="email"
                value={signinEmail}
                onChange={(event) => setSigninEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label
                htmlFor="signin-password"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {t("login.password")}
              </label>
              <input
                id="signin-password"
                type="password"
                value={signinPassword}
                onChange={(event) => setSigninPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || isVerifying}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isSubmitting ? t("login.signingIn") : t("login.signInWithEmail")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="mt-6 space-y-4 border-t border-slate-200 pt-6">
            <div>
              <label
                htmlFor="register-name"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {t("login.name")}
              </label>
              <input
                id="register-name"
                type="text"
                value={registerName}
                onChange={(event) => setRegisterName(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoComplete="name"
                required
              />
            </div>
            <div>
              <label
                htmlFor="register-email"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {t("login.email")}
              </label>
              <input
                id="register-email"
                type="email"
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label
                htmlFor="register-password"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {t("login.password")}
              </label>
              <input
                id="register-password"
                type="password"
                value={registerPassword}
                onChange={(event) => setRegisterPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || isVerifying}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isSubmitting ? t("login.creatingAccount") : t("login.createAccount")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
