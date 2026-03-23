"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { appTitle } from "@/lib/app-config";
import { usePublicSiteSettings } from "@/lib/hooks/use-public-site-settings";
import { useT } from "@/lib/i18n";

type InviteState = "loading" | "valid" | "invalid" | "accepted";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const { data: siteSettings } = usePublicSiteSettings();
  const siteTitle = siteSettings?.siteTitle || appTitle;

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<InviteState>("loading");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    void authApi
      .validateInvite(token)
      .then((result) => {
        if (cancelled) return;
        if (result.valid && result.email) {
          setEmail(result.email);
          setState("valid");
        } else {
          setState("invalid");
        }
      })
      .catch(() => {
        if (!cancelled) setState("invalid");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await authApi.acceptInvite(token, { name, password });
      setState("accepted");
      redirectTimerRef.current = setTimeout(() => router.push("/login"), 2000);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, t("invite.acceptError")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">{siteTitle}</p>

        {state === "loading" ? (
          <p className="mt-6 text-sm text-gray-500">{t("invite.validating")}</p>
        ) : null}

        {state === "invalid" ? (
          <div className="mt-6">
            <h1 className="text-xl font-semibold text-slate-900">{t("invite.invalidTitle")}</h1>
            <p className="mt-2 text-sm text-slate-600">{t("invite.invalidDescription")}</p>
            <a
              href="/login"
              className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {t("invite.goToLogin")}
            </a>
          </div>
        ) : null}

        {state === "accepted" ? (
          <div className="mt-6">
            <h1 className="text-xl font-semibold text-emerald-700">{t("invite.acceptedTitle")}</h1>
            <p className="mt-2 text-sm text-slate-600">{t("invite.acceptedDescription")}</p>
          </div>
        ) : null}

        {state === "valid" ? (
          <div className="mt-6">
            <h1 className="text-xl font-semibold text-slate-900">{t("invite.title")}</h1>
            <p className="mt-2 text-sm text-slate-600">{t("invite.description", { email })}</p>

            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="invite-name"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  {t("invite.name")}
                </label>
                <input
                  id="invite-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoComplete="name"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="invite-password"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  {t("invite.password")}
                </label>
                <input
                  id="invite-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <p className="mt-1 text-xs text-gray-500">{t("invite.passwordHint")}</p>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSubmitting ? t("invite.accepting") : t("invite.accept")}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </main>
  );
}
