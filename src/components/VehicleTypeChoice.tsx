import car from "../assets/vehicles/car.svg";
import scooter from "../assets/vehicles/scooter.svg";
import { VEHICLE_TYPES, type VehicleType } from "../lib/vehicleType";
import { useT } from "../i18n";

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
  useT();
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
  return <img src={type === "bike" ? scooter : car} alt="" className="vehicle-art" width={72} height={72} aria-hidden="true" />;
}
