import type { CustomerFields, FieldErrors } from "../lib/customer";
import { t } from "../i18n";
import { Field, fieldProps } from "./fields";
import PreviousCustomer from "./PreviousCustomer";

/**
 * Vehicle number, customer name, phone and address, for use inside a `.grid`.
 * The vehicle comes first so a returning customer's details can be filled in.
 */
export default function CustomerInputs({
  value,
  errors,
  onChange,
}: {
  value: CustomerFields;
  errors: FieldErrors;
  onChange: (patch: Partial<CustomerFields>) => void;
}) {
  return (
    <>
      <Field fieldKey="vehicleReg" label={t("customer.vehicleReg")} required error={errors.vehicleReg}>
        <input
          {...fieldProps("vehicleReg", errors.vehicleReg)}
          type="text"
          className="uppercase"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="KA 01 AB 1234"
          value={value.vehicleReg}
          onChange={(e) => onChange({ vehicleReg: e.target.value })}
        />
      </Field>
      <Field fieldKey="customerName" label={t("customer.name")} required error={errors.customerName}>
        <input
          {...fieldProps("customerName", errors.customerName)}
          type="text"
          autoComplete="off"
          autoCapitalize="words"
          value={value.customerName}
          onChange={(e) => onChange({ customerName: e.target.value })}
        />
      </Field>
      <div className="span-2">
        <PreviousCustomer fields={value} onUse={onChange} />
      </div>
      <Field fieldKey="phone" label={t("customer.phone")} error={errors.phone}>
        <input
          {...fieldProps("phone", errors.phone)}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="98765 43210"
          value={value.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </Field>
      <Field fieldKey="address" label={t("customer.address")} error={errors.address}>
        <textarea
          {...fieldProps("address", errors.address)}
          rows={1}
          value={value.address}
          onChange={(e) => onChange({ address: e.target.value })}
        />
      </Field>
    </>
  );
}
