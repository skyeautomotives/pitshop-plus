import { VEHICLE_TYPES, type VehicleType } from "../lib/vehicleType";

/** Two big buttons: Bikes or Cars. */
export default function VehicleTypeChoice({
  value,
  onChange,
  id,
  invalid,
  describedBy,
}: {
  value: VehicleType | null;
  onChange: (v: VehicleType) => void;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="vehicle-type" role="radiogroup" aria-invalid={invalid || undefined} aria-describedby={describedBy}>
      {VEHICLE_TYPES.map((t, i) => (
        <button
          key={t.id}
          id={i === 0 ? id : undefined}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          className={`vehicle-type-option${value === t.id ? " selected" : ""}`}
          onClick={() => onChange(t.id)}
        >
          <VehicleIcon type={t.id} />
          <span className="vehicle-type-label">{t.label}</span>
          <span className="vehicle-type-hint">{t.hint}</span>
        </button>
      ))}
    </div>
  );
}

function VehicleIcon({ type }: { type: VehicleType }) {
  return type === "bike" ? (
    <svg viewBox="0 0 48 32" width="44" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="22" r="7" />
      <circle cx="38" cy="22" r="7" />
      <path d="M10 22l8-10h10l4 10M18 12l-3-5h-4M28 12l3-6h5M32 22h6" />
    </svg>
  ) : (
    <svg viewBox="0 0 48 32" width="44" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 22v-6l5-1 6-7h16l7 7 6 1v6h-4" />
      <path d="M17 22h14" />
      <circle cx="12" cy="22" r="4.5" />
      <circle cx="36" cy="22" r="4.5" />
      <path d="M16 15h22M24 8v7" />
    </svg>
  );
}
