import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useT } from "../i18n";
import AuthLayout from "../components/AuthLayout";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../lib/auth";
import { authRedirectUrl } from "../lib/platform";
import { errorMessage, supabase } from "../lib/supabase";
import { usePageTitle } from "../lib/usePageTitle";

const MIN_PASSWORD = 8;

/** Owners ask for an email with a link to choose a new password. */
export function ForgotPassword() {
  const { t } = useT();
  usePageTitle(t("login.forgotTitle"));
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address.includes("@")) {
      setError(t("login.forgotEmailMissing"));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${authRedirectUrl()}reset-password` });
    setBusy(false);
    if (err) setError(errorMessage(err));
    else setSentTo(address);
  }

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} noValidate>
        <h1 className="auth-title">{t("login.forgotTitle")}</h1>
        {sentTo ? (
          <div className="alert alert-success" role="status">
            {t("login.forgotSent", { email: sentTo })}
          </div>
        ) : (
          <>
            <p className="auth-sub">{t("login.forgotSub")}</p>
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <div className="field">
              <label htmlFor="email">{t("register.email")}</label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? t("login.forgotSending") : t("login.forgotSend")}
            </button>
            <p className="hint auth-staff">{t("login.forgotStaff")}</p>
          </>
        )}
        <p className="auth-switch">
          <Link to="/login">{t("login.backToSignIn")}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

/** Where the reset email's link lands: the link signs the owner in, then they choose a new password. */
export function ResetPassword() {
  const { t } = useT();
  usePageTitle(t("login.resetTitle"));
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(t("register.passwordShort", { n: MIN_PASSWORD }));
    if (confirm !== password) return setError(t("register.passwordMismatch"));
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(errorMessage(err));
    else navigate("/dashboard", { replace: true });
  }

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} noValidate>
        <h1 className="auth-title">{t("login.resetTitle")}</h1>
        {loading ? (
          <p className="auth-sub">{t("login.resetChecking")}</p>
        ) : !session ? (
          <>
            <div className="alert alert-error" role="alert">
              {t("login.resetExpired")}
            </div>
            <p className="auth-switch">
              <Link to="/forgot-password">{t("login.forgotSend")}</Link>
            </p>
          </>
        ) : (
          <>
            <p className="auth-sub">{t("login.resetSub")}</p>
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <div className="field">
              <label htmlFor="new-password">{t("login.resetNew")}</label>
              <PasswordInput id="new-password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="hint">{t("register.passwordHint", { n: MIN_PASSWORD })}</p>
            </div>
            <div className="field">
              <label htmlFor="confirm-password">{t("login.resetConfirm")}</label>
              <PasswordInput id="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? t("login.resetSaving") : t("login.resetSave")}
            </button>
          </>
        )}
      </form>
    </AuthLayout>
  );
}
