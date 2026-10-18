import { useState, type FormEvent } from "react";
import LanguageSwitch from "../components/LanguageSwitch";
import { useT } from "../i18n";
import { Link, Navigate, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { errorMessage, isRemembered, rememberedEmail, setRememberMe, supabase } from "../lib/supabase";
import { LOGIN_DOMAIN, loginEmail, normalizeUsername } from "../lib/username";
import { authRedirectUrl, isNativeApp } from "../lib/platform";
import { PlatformIcon } from "./marketing/Home";
import { DOWNLOADS } from "./marketing/Site";
import AuthLayout from "../components/AuthLayout";
import { usePageTitle } from "../lib/usePageTitle";
import PasswordInput from "../components/PasswordInput";

/** Remembered sign-in name: an owner's email, or a staff username (older versions saved <username>@pitstop.invalid). */
function rememberedLogin(): string {
  const saved = rememberedEmail();
  return saved.endsWith(`@${LOGIN_DOMAIN}`) ? saved.split("@")[0] : saved;
}

/** Owners sign in with their email; staff added by an owner sign in with a username. */
function signInEmail(login: string): string {
  const v = login.trim().toLowerCase();
  return v.includes("@") ? v : loginEmail(normalizeUsername(v));
}

export default function Login() {
  usePageTitle("Sign in");
  const { session, loading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/dashboard";
  const [email, setEmail] = useState(rememberedLogin);
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [remember, setRemember] = useState(isRemembered);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { t } = useT();

  if (loading) return <p className="page-status">{t("common.loading")}</p>;
  if (session) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const login = email.trim().toLowerCase();
    if (!login || !password) {
      setError(t("login.missing"));
      return;
    }
    setBusy(true);
    setError(null);
    setUnconfirmed(null);
    setRememberMe(remember, login.includes("@") ? login : normalizeUsername(login));
    const address = signInEmail(login);
    const { error: err } = await supabase.auth.signInWithPassword({ email: address, password });
    if (err) {
      if (/not confirmed/i.test(err.message)) {
        setUnconfirmed(address);
        setError(t("login.confirmFirst"));
      } else {
        setError(errorMessage(err));
      }
      setBusy(false);
    }
  }

  async function resend() {
    if (!unconfirmed) return;
    const { error: err } = await supabase.auth.resend({ type: "signup", email: unconfirmed, options: { emailRedirectTo: authRedirectUrl() } });
    if (err) setError(errorMessage(err));
    else setResent(true);
  }

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} noValidate>
        <LanguageSwitch />
        <h1 className="auth-title">{t("login.title")}</h1>
        <p className="auth-sub">{t("login.subtitle")}</p>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
            {unconfirmed && (
              <button type="button" className="link-button resend" onClick={() => void resend()} disabled={resent}>
                {resent ? t("login.resent") : t("login.resend")}
              </button>
            )}
          </div>
        )}
        <div className="field">
          <label htmlFor="email">{t("login.emailOrUsername")}</label>
          <input
            id="email"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={!email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">{t("login.password")}</label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            autoFocus={!!email}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <label className="check remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t("login.rememberMe")}
        </label>
        <p className="hint remember-hint">
          {remember ? t("login.rememberOn") : t("login.rememberOff")}
        </p>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? t("login.signingIn") : t("login.title")}
        </button>
        <p className="auth-switch">
          {t("login.newWorkshop")} <Link to="/register">{t("login.registerLink")}</Link>
        </p>
        <p className="hint auth-staff">{t("login.staffHint")}</p>
        {!isNativeApp && (
          <div className="get-app">
            <p>{t("login.getApp")}</p>
            <div className="get-app-links">
              <a href={DOWNLOADS.windows}>
                <PlatformIcon kind="windows" /> Windows
              </a>
              <a href={DOWNLOADS.android}>
                <PlatformIcon kind="android" /> Android
              </a>
            </div>
            <Link to="/download" className="get-app-more">
              {t("login.allDownloads")}
            </Link>
          </div>
        )}
      </form>
    </AuthLayout>
  );
}
