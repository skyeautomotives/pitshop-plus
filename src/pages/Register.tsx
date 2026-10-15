import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { Field, fieldProps } from "../components/fields";
import { registerShop } from "../lib/api";
import { useAuth } from "../lib/auth";
import { errorMessage, setRememberMe, supabase } from "../lib/supabase";
import { loginEmail, normalizeUsername, USERNAME_HINT, usernameError } from "../lib/username";

const MIN_PASSWORD = 8;

interface Form {
  shopName: string;
  fullName: string;
  phone: string;
  username: string;
  password: string;
  confirm: string;
}

type Errors = Partial<Record<keyof Form, string>>;

function validate(f: Form): Errors {
  const errors: Errors = {};
  if (!f.shopName.trim()) errors.shopName = "Enter your workshop's name.";
  if (!f.fullName.trim()) errors.fullName = "Enter your name.";
  const digits = f.phone.replace(/\D/g, "");
  if (f.phone.trim() && (digits.length < 10 || digits.length > 13)) errors.phone = "Enter a 10-digit phone number.";
  const u = usernameError(f.username);
  if (u) errors.username = u;
  if (f.password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  else if (f.confirm !== f.password) errors.confirm = "The passwords don't match.";
  return errors;
}

/** Sign-up for a new workshop: creates the shop and its owner login, then signs in. */
export default function Register() {
  const { session, loading } = useAuth();
  const [form, setForm] = useState<Form>({ shopName: "", fullName: "", phone: "", username: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    const username = normalizeUsername(form.username);
    setBusy(true);
    setError(null);
    try {
      await registerShop({
        shop_name: form.shopName.trim(),
        full_name: form.fullName.trim(),
        phone: form.phone.trim(),
        username,
        password: form.password,
      });
      setRememberMe(true, username);
      const { error: err } = await supabase.auth.signInWithPassword({ email: loginEmail(username), password: form.password });
      // Signed in: the auth listener redirects to the dashboard.
      if (err) throw err;
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
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
        <Field fieldKey="phone" label="Workshop phone" error={errors.phone}>
          <input {...fieldProps("phone", errors.phone)} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field fieldKey="username" label="Choose a username" required error={errors.username} hint={`You'll sign in with this. ${USERNAME_HINT}`}>
          <input
            {...fieldProps("username", errors.username)}
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={form.username}
            onChange={set("username")}
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
