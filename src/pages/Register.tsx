import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { Field, fieldProps } from "../components/fields";
import { useAuth } from "../lib/auth";
import { authRedirectUrl } from "../lib/platform";
import { errorMessage, supabase } from "../lib/supabase";

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Form {
  shopName: string;
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirm: string;
}

type Errors = Partial<Record<keyof Form, string>>;

function validate(f: Form): Errors {
  const errors: Errors = {};
  if (!f.shopName.trim()) errors.shopName = "Enter your workshop's name.";
  if (!f.fullName.trim()) errors.fullName = "Enter your name.";
  const digits = f.phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) errors.phone = "Enter a 10-digit mobile number.";
  if (!EMAIL_RE.test(f.email.trim())) errors.email = "Enter a valid email address.";
  if (f.password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  else if (f.confirm !== f.password) errors.confirm = "The passwords don't match.";
  return errors;
}

/** Sign-up for a new workshop. Supabase emails a confirmation link; the workshop is created with the login. */
export default function Register() {
  const { session, loading } = useAuth();
  const [form, setForm] = useState<Form>({ shopName: "", fullName: "", phone: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  if (loading) return <p className="page-status">Loading…</p>;
  if (session) return <Navigate to="/" replace />;

  const set = (key: keyof Form) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: e.target.value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    const email = form.email.trim().toLowerCase();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        emailRedirectTo: authRedirectUrl(),
        data: { shop_name: form.shopName.trim(), full_name: form.fullName.trim(), phone: form.phone.trim() },
      },
    });
    setBusy(false);
    if (err) {
      setError(/already registered/i.test(err.message) ? "That email is already registered. Sign in instead." : errorMessage(err));
      return;
    }
    // With email confirmation on there is no session yet: ask them to check their inbox.
    if (!data.session) setSentTo(email);
  }

  async function resend() {
    if (!sentTo) return;
    const { error: err } = await supabase.auth.resend({ type: "signup", email: sentTo, options: { emailRedirectTo: authRedirectUrl() } });
    if (err) setError(errorMessage(err));
    else setResent(true);
  }

  if (sentTo) {
    return (
      <main className="login">
        <div className="card login-card">
          <div className="login-brand">
            <img src={`${import.meta.env.BASE_URL}pitstop-plus.svg`} alt="Pitstop Plus" className="login-logo" />
          </div>
          <h1 className="check-title">Check your email</h1>
          <p>
            We sent a confirmation link to <strong>{sentTo}</strong>.
          </p>
          <ol className="steps">
            <li>Open the email from Pitstop Plus (check Spam or Promotions if you don't see it).</li>
            <li>
              Tap <strong>Confirm my email</strong>.
            </li>
            <li>Sign in with your email and password, and start billing.</li>
          </ol>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <button type="button" className="btn btn-outline btn-block" onClick={() => void resend()} disabled={resent}>
            {resent ? "Email sent again" : "Send the email again"}
          </button>
          <p className="hint login-switch">
            Confirmed already? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={onSubmit} noValidate>
        <div className="login-brand">
          <h1 className="sr-only">Register your workshop</h1>
          <img src={`${import.meta.env.BASE_URL}pitstop-plus.svg`} alt="Pitstop Plus" className="login-logo" />
          <p className="hint">Register your workshop to start making bills.</p>
        </div>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <Field fieldKey="shopName" label="Workshop name" required error={errors.shopName} hint="Printed at the top of your bills.">
          <input {...fieldProps("shopName", errors.shopName)} type="text" autoComplete="organization" autoFocus value={form.shopName} onChange={set("shopName")} />
        </Field>
        <Field fieldKey="fullName" label="Your name" required error={errors.fullName}>
          <input {...fieldProps("fullName", errors.fullName)} type="text" autoComplete="name" value={form.fullName} onChange={set("fullName")} />
        </Field>
        <Field fieldKey="phone" label="Mobile number" required error={errors.phone} hint="Shown on your bills. You can change it later.">
          <input {...fieldProps("phone", errors.phone)} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field fieldKey="email" label="Email" required error={errors.email} hint="You'll sign in with this. We'll send a link to confirm it.">
          <input
            {...fieldProps("email", errors.email)}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={form.email}
            onChange={set("email")}
          />
        </Field>
        <Field fieldKey="password" label="Password" required error={errors.password} hint={`At least ${MIN_PASSWORD} characters.`}>
          <input {...fieldProps("password", errors.password)} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
        <Field fieldKey="confirm" label="Confirm password" required error={errors.confirm}>
          <input {...fieldProps("confirm", errors.confirm)} type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
        </Field>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? "Registering…" : "Register workshop"}
        </button>
        <p className="hint login-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
