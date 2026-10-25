import { useState, type ChangeEvent, type FormEvent } from "react";
import Slot from "../components/Slot";
import { t, useT } from "../i18n";
import { Link, Navigate } from "react-router";
import { Field, fieldProps } from "../components/fields";
import { useAuth } from "../lib/auth";
import { authRedirectUrl } from "../lib/platform";
import { errorMessage, supabase } from "../lib/supabase";
import { usePageTitle } from "../lib/usePageTitle";
import AuthLayout from "../components/AuthLayout";
import PasswordInput from "../components/PasswordInput";
import TermsLink from "../components/TermsLink";
import VehicleTypeChoice from "../components/VehicleTypeChoice";
import type { VehicleType } from "../lib/vehicleType";
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
  if (!f.shopName.trim()) errors.shopName = t("register.shopNameMissing");
  if (!f.fullName.trim()) errors.fullName = t("register.nameMissing");
  const digits = f.phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) errors.phone = t("register.phoneInvalid");
  if (!EMAIL_RE.test(f.email.trim())) errors.email = t("register.emailInvalid");
  if (f.password.length < MIN_PASSWORD) errors.password = t("register.passwordShort", { n: MIN_PASSWORD });
  else if (f.confirm !== f.password) errors.confirm = t("register.passwordMismatch");
  return errors;
}

/** Sign-up for a new workshop. Supabase emails a confirmation link; the workshop is created with the login. */
export default function Register() {
  useT();
  usePageTitle(t("register.pageTitle"));
  const { session, loading } = useAuth();
  const [form, setForm] = useState<Form>({ shopName: "", fullName: "", phone: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [typeError, setTypeError] = useState<string | undefined>();
  const [termsError, setTermsError] = useState<string | undefined>();

  if (loading) return <p className="page-status">{t("common.loading")}</p>;
  if (session) return <Navigate to="/dashboard" replace />;

  const set = (key: keyof Form) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: e.target.value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setTermsError(agreed ? undefined : t("register.agreeMissing"));
    setTypeError(vehicleType ? undefined : t("register.typeMissing"));
    if (!vehicleType) {
      document.getElementById("f-vehicleType")?.focus();
      return;
    }
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
    setTaken(false);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        emailRedirectTo: authRedirectUrl(),
        data: {
          shop_name: form.shopName.trim(),
          full_name: form.fullName.trim(),
          phone: form.phone.trim(),
          vehicle_type: vehicleType,
          terms_version: TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
        },
      },
    });
    setBusy(false);
    // An email that already has an account comes back with no identities, and no email is sent.
    if ((err && /already registered/i.test(err.message)) || (!err && data.user?.identities?.length === 0)) {
      setTaken(true);
      setError(t("register.alreadyRegistered"));
      return;
    }
    if (err) {
      setError(errorMessage(err));
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
          <h1 className="auth-title">{t("register.checkEmail")}</h1>
          <p>
            <Slot text={t("register.sentTo")} name="email">
              <strong>{sentTo}</strong>
            </Slot>
          </p>
          <ol className="steps">
            <li>{t("register.step1")}</li>
            <li>
              <Slot text={t("register.step2")} name="button">
                <strong>Confirm my email</strong>
              </Slot>
            </li>
            <li>{t("register.step3")}</li>
          </ol>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <button type="button" className="btn btn-outline btn-block" onClick={() => void resend()} disabled={resent}>
            {resent ? t("register.sentAgain") : t("register.sendAgain")}
          </button>
          <p className="auth-switch">
            {t("register.confirmedAlready")} <Link to="/login">{t("login.title")}</Link>
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout wide>
      <form onSubmit={onSubmit} noValidate>
        <h1 className="auth-title">{t("register.title")}</h1>
        <p className="auth-sub">{t("register.subtitle")}</p>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
            {taken && (
              <span className="taken-links">
                <Link to="/login">{t("login.title")}</Link>
                <Link to="/forgot-password">{t("login.forgotLink")}</Link>
              </span>
            )}
          </div>
        )}
        <div className="field">
          <span className="label-like">
            {t("register.workOn")}
            <span className="required"> *</span>
          </span>
          <VehicleTypeChoice
            id="f-vehicleType"
            value={vehicleType}
            invalid={!!typeError}
            describedBy={typeError ? "f-vehicleType-error" : undefined}
            onChange={(v) => {
              setVehicleType(v);
              setTypeError(undefined);
            }}
          />
          {typeError && (
            <p className="field-error" id="f-vehicleType-error">
              {typeError}
            </p>
          )}
        </div>
        <div className="form-grid">
        <Field fieldKey="shopName" label={t("register.workshopName")} required error={errors.shopName} hint={t("register.onBills")}>
          <input {...fieldProps("shopName", errors.shopName)} type="text" autoComplete="organization" autoFocus value={form.shopName} onChange={set("shopName")} />
        </Field>
        <Field fieldKey="fullName" label={t("register.yourName")} required error={errors.fullName}>
          <input {...fieldProps("fullName", errors.fullName)} type="text" autoComplete="name" value={form.fullName} onChange={set("fullName")} />
        </Field>
        <Field fieldKey="phone" label={t("register.mobile")} required error={errors.phone} hint={t("register.onBills")}>
          <input {...fieldProps("phone", errors.phone)} type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field fieldKey="email" label={t("register.email")} required error={errors.email} hint={t("register.signInWith")}>
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
        <Field
          fieldKey="password"
          label={t("register.password")}
          required
          error={errors.password}
          hint={t("register.passwordHint", { n: MIN_PASSWORD })}
        >
          <PasswordInput {...fieldProps("password", errors.password)} autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
        <Field fieldKey="confirm" label={t("register.confirm")} required error={errors.confirm}>
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
              <Slot text={t("register.agree")} name="terms">
                <TermsLink>{t("register.terms")}</TermsLink>
              </Slot>
            </span>
          </label>
          {termsError && (
            <p className="field-error" id="f-terms-error">
              {termsError}
            </p>
          )}
        </div>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? t("register.registering") : t("register.button")}
        </button>
        <p className="auth-switch">
          {t("register.alreadyAccount")} <Link to="/login">{t("login.title")}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
