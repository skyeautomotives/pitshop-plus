import type { InputHTMLAttributes, ReactNode } from "react";

/** id, aria-invalid and aria-describedby for the input of field `key`. */
export function fieldProps(key: string, error?: string) {
  return {
    id: `f-${key}`,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `f-${key}-error` : undefined,
  };
}

export function FieldError({ fieldKey, error }: { fieldKey: string; error?: string }) {
  if (!error) return null;
  return (
    <p className="field-error" id={`f-${fieldKey}-error`}>
      {error}
    </p>
  );
}

interface FieldProps {
  fieldKey: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ fieldKey, label, required, hint, error, className, children }: FieldProps) {
  return (
    <div className={`field${error ? " has-error" : ""}${className ? ` ${className}` : ""}`}>
      <label htmlFor={`f-${fieldKey}`}>
        {label}
        {required ? <span className="required"> *</span> : <span className="optional"> (optional)</span>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
      <FieldError fieldKey={fieldKey} error={error} />
    </div>
  );
}

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode"> & { invalid?: boolean };

/** Text input for rupee amounts (number pad on phones, ₹ prefix). */
export function MoneyInput({ invalid, className, ...rest }: MoneyInputProps) {
  return (
    <div className={`money-input${invalid ? " invalid" : ""}${className ? ` ${className}` : ""}`}>
      <span aria-hidden="true">₹</span>
      <input type="text" inputMode="decimal" autoComplete="off" placeholder="0" {...rest} />
    </div>
  );
}
