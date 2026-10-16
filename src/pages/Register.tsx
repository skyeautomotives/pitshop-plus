import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { Field, fieldProps } from "../components/fields";
import { useAuth } from "../lib/auth";
import { authRedirectUrl } from "../lib/platform";
import { errorMessage, supabase } from "../lib/supabase";
import { usePageTitle } from "../lib/usePageTitle";
import AuthLayout from "../components/AuthLayout";
import PasswordInput from "../components/PasswordInput";
import TermsLink from "../components/TermsLink";
import { TERMS_VERSION } from "./marketing/Terms";

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
  usePageTitle("Register your workshop");
  const { session, loading } = useAuth();
  const [form, setForm] = useState<Form>({ shopName: "", fullName: "", phone: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [termsError, setTermsError] = useState<string | undefined>();

  if (loading) return <p className="page-status">Loading…</p>;
  if (session) return <Navigate to="/dashboard" replace />;

  const set = (key: keyof Form) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: e.target.value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setTermsError(agreed ? undefined : "Please read and agree to the Terms & Conditions.");
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    if (!agreed) {
      document.getElementById("f-terms")?.focus();
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
        data: {
          shop_name: form.shopName.trim(),
          full_name: form.fullName.trim(),
          phone: form.phone.trim(),
          terms_version: TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
        },
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
      <AuthLayout>
        <div>
          <h1 className="auth-title">Check your email</h1>
          <p>
            We sent a confirmation link to <strong>{sentTo}</strong>.
          </p>
          <ol className="steps">
            <li>Open the email from Pitshop Plus (check Spam or Promotions if you don't see it).</li>
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
          <p className="auth-switch">
            Confirmed already? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout wide>
      <form onSubmit={onSubmit} noValidate>
        <h1 className="auth-title">Register your workshop</h1>
        <p className="auth-sub">Create your account. We will email you a link to confirm it.</p>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
        <Field fieldKey="shopName" label="Workshop name" required error={errors.shopName} hint="Printed on your bills.">
          <input {...fieldProps("shopName", errors.shopName)} type="text" autoComplete="organization" autoFocus value={form.shopName} onChange={set("shopName")} />
        </Field>
        <Field fieldKey="fullName" label="Your name" required error={errors.fullName}>
          <input {...fieldProps("fullName", errors.fullName)} type="text" autoComplete="name" value={form.fullName} onChange={set("fullName")} />
        </Field>
        <Field fieldKey="phone" label="Mobile number" required error={errors.phone} hint="Printed on your bills.">
          <input {...fieldProps("phone", errors.phone)} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field fieldKey="email" label="Email" required error={errors.email} hint="You will sign in with this.">
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
          <PasswordInput {...fieldProps("password", errors.password)} autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
        <Field fieldKey="confirm" label="Confirm password" required error={errors.confirm}>
          <PasswordInput {...fieldProps("confirm", errors.confirm)} autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
        </Field>
        </div>
        <div className="terms-agree">
          <label className="check">
            <input
              id="f-terms"
              type="checkbox"
              checked={agreed}
              aria-invalid={!!termsError}
              aria-describedby={termsError ? "f-terms-error" : undefined}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setTermsError(undefined);
              }}
            />
            <span>
              I agree to the <TermsLink />, including that I am responsible for keeping backups of my workshop's records.
            </span>
          </label>
          {termsError && (
            <p className="field-error" id="f-terms-error">
              {termsError}
            </p>
          )}
        </div>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? "Registering…" : "Register workshop"}
        </button>
        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
