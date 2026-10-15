import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { useAuth } from "../lib/auth";
import { errorMessage, isRemembered, rememberedEmail, setRememberMe, supabase } from "../lib/supabase";
import { LOGIN_DOMAIN, loginEmail, normalizeUsername } from "../lib/username";
import { authRedirectUrl } from "../lib/platform";
import BrandMark from "../components/BrandMark";

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
  const { session, loading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/";
  const [email, setEmail] = useState(rememberedLogin);
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [remember, setRemember] = useState(isRemembered);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="page-status">Loading…</p>;
  if (session) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const login = email.trim().toLowerCase();
    if (!login || !password) {
      setError("Enter your email (or username) and password.");
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
        setError("Please confirm your email first. Open the link we emailed you (check Spam too).");
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
    <main className="login">
      <form className="card login-card" onSubmit={onSubmit} noValidate>
        <div className="login-brand">
          <h1 className="sr-only">Pitstop Plus</h1>
          <BrandMark />
          <p className="hint">Sign in to create and find bills.</p>
        </div>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
            {unconfirmed && (
              <button type="button" className="link-button resend" onClick={() => void resend()} disabled={resent}>
                {resent ? "Confirmation email sent again." : "Send the confirmation email again"}
              </button>
            )}
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email or username</label>
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
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus={!!email}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <label className="check remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me on this device
        </label>
        <p className="hint remember-hint">
          {remember
            ? "You'll stay signed in until you press Sign out."
            : "You'll be signed out when you close the browser. Use this on shared computers."}
        </p>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="hint login-switch">
          New workshop? <Link to="/register">Register your workshop</Link>
        </p>
        <p className="hint">Staff: sign in with the username your workshop owner gave you.</p>
      </form>
    </main>
  );
}
