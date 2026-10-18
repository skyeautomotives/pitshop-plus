import car from "../assets/vehicles/car.png";
import motorcycle from "../assets/vehicles/motorcycle.png";
import scooter from "../assets/vehicles/scooter.png";
import suv from "../assets/vehicles/suv.png";
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

/** Two vehicles of the kind, slightly overlapping: motorcycle and scooter, or car and SUV. */
function VehicleIcon({ type }: { type: VehicleType }) {
  const [main, second] = type === "bike" ? [motorcycle, scooter] : [car, suv];
  return (
    <span className="vehicle-art" aria-hidden="true">
      <img src={second} alt="" className="vehicle-art-back" width={60} height={60} />
      <img src={main} alt="" className="vehicle-art-front" width={80} height={80} />
    </span>
  );
}
