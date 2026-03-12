"use client";

import { authApi, useAuthMeQuery } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { appTitle } from "@/lib/app-config";
import { useLocale, type SupportedLocale } from "@/lib/i18n";
import Link from "next/link";
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
};

const loginCopy: Record<SupportedLocale, LoginCopy> = {
  ja: {
    loading: "読み込み中...",
    titleSignin: "サインイン",
    titleRegister: "アカウント作成",
    intro: "Google SSO とメール/パスワードは同じメールアドレスのアカウントに統合されます。",
    tabSignin: "サインイン",
    tabRegister: "登録",
    continueGoogle: "Google で続行",
    verifyInProgress: "メールを確認しています...",
    verifySuccess: "メール確認が完了しました。サインインしています...",
    verifyError: "メール確認に失敗しました。",
    signInError: "サインインに失敗しました。",
    registerError: "アカウント登録に失敗しました。",
    registerStarted:
      "登録を開始しました。セットアップ完了のため、API ログに出力された確認リンクを開いてください。",
    email: "メールアドレス",
    password: "パスワード",
    name: "名前",
    signInWithEmail: "メールでサインイン",
    signingIn: "サインイン中...",
    registrationHint:
      "登録はメール確認後に完了します。ローカル開発ではリンクが API ログに出力されます。",
    createAccount: "アカウント作成",
    creatingAccount: "アカウント作成中...",
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
    verifySuccess: "Email verified. Signing you in...",
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
  },
  "zh-CN": {
    loading: "加载中...",
    titleSignin: "登录",
    titleRegister: "创建账号",
    intro: "Google SSO 和邮箱/密码都会归并到相同邮箱地址的账号。",
    tabSignin: "登录",
    tabRegister: "注册",
    continueGoogle: "使用 Google 继续",
    verifyInProgress: "正在验证邮箱...",
    verifySuccess: "邮箱验证完成，正在为你登录...",
    verifyError: "邮箱验证失败。",
    signInError: "登录失败。",
    registerError: "注册账号失败。",
    registerStarted: "已开始注册。请打开 API 日志中的验证链接完成设置。",
    email: "邮箱",
    password: "密码",
    name: "姓名",
    signInWithEmail: "使用邮箱登录",
    signingIn: "登录中...",
    registrationHint: "邮箱验证后才会完成注册。在本地开发环境中，链接会写入 API 日志。",
    createAccount: "创建账号",
    creatingAccount: "正在创建账号...",
  },
  ko: {
    loading: "불러오는 중...",
    titleSignin: "로그인",
    titleRegister: "계정 만들기",
    intro: "Google SSO와 이메일/비밀번호는 같은 이메일 주소의 계정으로 연결됩니다.",
    tabSignin: "로그인",
    tabRegister: "등록",
    continueGoogle: "Google로 계속하기",
    verifyInProgress: "이메일을 확인하는 중...",
    verifySuccess: "이메일 확인이 완료되었습니다. 로그인 중입니다...",
    verifyError: "이메일 확인에 실패했습니다.",
    signInError: "로그인에 실패했습니다.",
    registerError: "계정 등록에 실패했습니다.",
    registerStarted: "등록을 시작했습니다. 설정을 완료하려면 API 로그의 인증 링크를 여세요.",
    email: "이메일",
    password: "비밀번호",
    name: "이름",
    signInWithEmail: "이메일로 로그인",
    signingIn: "로그인 중...",
    registrationHint:
      "이메일 확인 후 등록이 완료됩니다. 로컬 개발에서는 링크가 API 로그에 기록됩니다.",
    createAccount: "계정 만들기",
    creatingAccount: "계정 생성 중...",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading } = useAuthMeQuery();
  const locale = useLocale();
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
  const copy: LoginCopy = loginCopy[locale as SupportedLocale] ?? loginCopy.en;

  useEffect(() => {
    if (data?.user) {
      router.replace("/");
    }
  }, [data?.user, router]);

  useEffect(() => {
    const token = searchParams.get("verify");
    if (!token) return;

    let cancelled = false;
    setIsVerifying(true);
    setError(null);
    setMessage(copy.verifyInProgress);

    void authApi
      .verifyEmail({ token })
      .then(() => {
        if (cancelled) return;
        setMessage(copy.verifySuccess);
        router.replace("/");
        router.refresh();
      })
      .catch((verifyError) => {
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
    router,
    searchParams,
  ]);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await authApi.login({ email: signinEmail, password: signinPassword });
      router.replace("/");
      router.refresh();
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
      await authApi.register({
        name: registerName,
        email: registerEmail,
        password: registerPassword,
      });
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
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">{appTitle}</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          {view === "signin" ? copy.titleSignin : copy.titleRegister}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{copy.intro}</p>

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

        <div className="mt-6 space-y-3">
          <Link
            href="/oauth2/start"
            className="block rounded-lg border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {copy.continueGoogle}
          </Link>
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

        {view === "signin" ? (
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
