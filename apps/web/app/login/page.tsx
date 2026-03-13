"use client";

import { authApi, siteSettingsApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { appTitle } from "@/lib/app-config";
import { useAuthContext } from "@/lib/auth-context";
import { useLocale, type SupportedLocale } from "@/lib/i18n";
import { normalizeReturnTo } from "@/lib/return-to";
import { useAuthActions } from "@/lib/use-auth-actions";
import { usePasswordAuth } from "@/lib/use-password-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type AuthView = "signin" | "register";

type LoginCopy = {
  loading: string;
  titleSignin: string;
  titleRegister: string;
  intro: string;
  tabSignin: string;
  tabRegister: string;
  continueGoogle: string;
  verifyInProgress: string;
  verifySuccess: string;
  verifyError: string;
  signInError: string;
  registerError: string;
  registerStarted: string;
  email: string;
  password: string;
  name: string;
  signInWithEmail: string;
  signingIn: string;
  registrationHint: string;
  createAccount: string;
  creatingAccount: string;
  registrationClosed: string;
};

const loginCopy: Record<SupportedLocale, LoginCopy> = {
  ja: {
    loading: "読み込み中...",
    titleSignin: "サインイン",
    titleRegister: "アカウント登録",
    intro: "Google SSO とメール/パスワードは同じメールアドレスのアカウントに統合されます。",
    tabSignin: "サインイン",
    tabRegister: "登録",
    continueGoogle: "Google で続行",
    verifyInProgress: "メールを確認しています...",
    verifySuccess: "メール確認が完了しました。パスワードでサインインしてください。",
    verifyError: "メール確認に失敗しました。",
    signInError: "サインインに失敗しました。",
    registerError: "アカウント登録に失敗しました。",
    registerStarted:
      "登録を開始しました。セットアップを完了するには API ログに出力された確認リンクを開いてください。",
    email: "メールアドレス",
    password: "パスワード",
    name: "名前",
    signInWithEmail: "メールでサインイン",
    signingIn: "サインイン中...",
    registrationHint:
      "登録はメール確認後に完了します。ローカル開発では確認リンクが API ログに出力されます。",
    createAccount: "アカウント登録",
    creatingAccount: "アカウント登録中...",
    registrationClosed: "新規登録は現在受け付けていません。管理者にお問い合わせください。",
  },
  en: {
    loading: "Loading...",
    titleSignin: "Sign in",
    titleRegister: "Create account",
    intro: "Google SSO and email/password both resolve to the same account email.",
    tabSignin: "Sign in",
    tabRegister: "Register",
    continueGoogle: "Continue with Google",
    verifyInProgress: "Verifying your email...",
    verifySuccess: "Email verified. Please sign in with your password.",
    verifyError: "Failed to verify email.",
    signInError: "Failed to sign in.",
    registerError: "Failed to register account.",
    registerStarted:
      "Registration started. Open the verification link from the API log to finish setup.",
    email: "Email",
    password: "Password",
    name: "Name",
    signInWithEmail: "Sign in with email",
    signingIn: "Signing in...",
    registrationHint:
      "Registration completes after email verification. In local development the link is written to the API log.",
    createAccount: "Create account",
    creatingAccount: "Creating account...",
    registrationClosed: "Registration is currently closed. Please contact an administrator.",
  },
  "zh-CN": {
    loading: "加载中...",
    titleSignin: "登录",
    titleRegister: "创建账户",
    intro: "Google SSO 与邮箱/密码登录会归并到同一个邮箱账户。",
    tabSignin: "登录",
    tabRegister: "注册",
    continueGoogle: "使用 Google 继续",
    verifyInProgress: "正在验证邮箱...",
    verifySuccess: "邮箱验证完成。请使用密码登录。",
    verifyError: "邮箱验证失败。",
    signInError: "登录失败。",
    registerError: "注册账户失败。",
    registerStarted: "注册已开始。请打开 API 日志中的验证链接以完成设置。",
    email: "邮箱",
    password: "密码",
    name: "姓名",
    signInWithEmail: "使用邮箱登录",
    signingIn: "登录中...",
    registrationHint:
      "注册会在邮箱验证后完成。在本地开发环境中，验证链接会写入 API 日志。",
    createAccount: "创建账户",
    creatingAccount: "正在创建账户...",
    registrationClosed: "当前不接受新注册。请联系管理员。",
  },
  ko: {
    loading: "불러오는 중...",
    titleSignin: "로그인",
    titleRegister: "계정 만들기",
    intro: "Google SSO 와 이메일/비밀번호 로그인은 같은 이메일 계정으로 통합됩니다.",
    tabSignin: "로그인",
    tabRegister: "등록",
    continueGoogle: "Google로 계속하기",
    verifyInProgress: "이메일을 확인하는 중...",
    verifySuccess: "이메일 확인이 완료되었습니다. 비밀번호로 로그인해 주세요.",
    verifyError: "이메일 확인에 실패했습니다.",
    signInError: "로그인에 실패했습니다.",
    registerError: "계정 등록에 실패했습니다.",
    registerStarted: "등록이 시작되었습니다. 설정을 완료하려면 API 로그의 확인 링크를 여세요.",
    email: "이메일",
    password: "비밀번호",
    name: "이름",
    signInWithEmail: "이메일로 로그인",
    signingIn: "로그인 중...",
    registrationHint:
      "등록은 이메일 확인 후 완료됩니다. 로컬 개발 환경에서는 확인 링크가 API 로그에 기록됩니다.",
    createAccount: "계정 만들기",
    creatingAccount: "계정 생성 중...",
    registrationClosed: "현재 신규 등록을 받지 않습니다. 관리자에게 문의해 주세요.",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuthContext();
  const locale = useLocale();
  const returnTo = normalizeReturnTo(searchParams.get("returnTo"));
  const { googleSignInUrl } = useAuthActions({ returnTo });
  const { signIn, register, verifyEmail } = usePasswordAuth();
  const getApiErrorMessage = useApiErrorMessage();
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
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [siteTitle, setSiteTitle] = useState(appTitle);
  const copy: LoginCopy = loginCopy[locale as SupportedLocale] ?? loginCopy.en;

  useEffect(() => {
    if (user) {
      router.replace(returnTo ?? "/");
    }
  }, [returnTo, router, user]);

  useEffect(() => {
    void authApi.registrationStatus().then((res) => setRegistrationOpen(res.open)).catch(() => setRegistrationOpen(false));
    void siteSettingsApi.get().then((s) => setSiteTitle(s.siteTitle || appTitle)).catch(() => {});
  }, []);

  useEffect(() => {
    const token = searchParams.get("verify");
    if (!token) return;

    let cancelled = false;
    setIsVerifying(true);
    setError(null);
    setMessage(copy.verifyInProgress);

    void verifyEmail(token, returnTo)
      .then(() => {
        if (cancelled) return;
        setMessage(copy.verifySuccess);
      })
      .catch((verifyError: unknown) => {
        if (cancelled) return;
        setError(getApiErrorMessage(verifyError, copy.verifyError));
        setMessage(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsVerifying(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    copy.verifyError,
    copy.verifyInProgress,
    copy.verifySuccess,
    getApiErrorMessage,
    returnTo,
    searchParams,
    verifyEmail,
  ]);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await signIn({ email: signinEmail, password: signinPassword }, returnTo);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, copy.signInError));
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
        returnTo,
      );
      // immediate registration (first admin) auto-signs in via the hook
      if (result.immediate) return;
      setMessage(copy.registerStarted);
      setView("signin");
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, copy.registerError));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        {copy.loading}
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">{siteTitle}</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          {view === "signin" ? copy.titleSignin : copy.titleRegister}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{copy.intro}</p>

        {registrationOpen ? (
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setView("signin");
                setError(null);
                setMessage(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                view === "signin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {copy.tabSignin}
            </button>
            <button
              type="button"
              onClick={() => {
                setView("register");
                setError(null);
                setMessage(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                view === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {copy.tabRegister}
            </button>
          </div>
        ) : registrationOpen === false ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {copy.registrationClosed}
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          <a
            href={googleSignInUrl}
            className="block rounded-lg border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {copy.continueGoogle}
          </a>
        </div>

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
              <label htmlFor="signin-email" className="mb-1 block text-sm font-medium text-slate-700">
                {copy.email}
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
                {copy.password}
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
              {isSubmitting ? copy.signingIn : copy.signInWithEmail}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="mt-6 space-y-4 border-t border-slate-200 pt-6">
            <div>
              <label
                htmlFor="register-name"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {copy.name}
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
                {copy.email}
              </label>
              <input
                id="register-email"
                type="email"
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label
                htmlFor="register-password"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {copy.password}
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
            <p className="text-xs text-slate-500">{copy.registrationHint}</p>
            <button
              type="submit"
              disabled={isSubmitting || isVerifying}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isSubmitting ? copy.creatingAccount : copy.createAccount}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
