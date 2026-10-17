import { useState } from "react";
import { updateShopSettings } from "../lib/api";
import { useShopSettings } from "../lib/shopSettings";
import { errorMessage } from "../lib/supabase";
import type { VehicleType } from "../lib/vehicleType";
import VehicleTypeChoice from "./VehicleTypeChoice";

/** For owners of workshops that registered before the workshop type was asked: choose it once. */
export default function WorkshopTypePrompt() {
  const { settings, reload } = useShopSettings();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!settings || settings.vehicle_type) return null;

  async function choose(v: VehicleType) {
    if (!settings || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateShopSettings({ ...settings, vehicle_type: v });
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card workshop-type-prompt no-print" aria-labelledby="workshop-type-title">
      <h2 id="workshop-type-title">Does your workshop work on bikes or cars?</h2>
      <p className="hint">This sets the job lists and examples you see when taking a vehicle in. You can change it later in Settings.</p>
      <VehicleTypeChoice value={null} onChange={(v) => void choose(v)} />
      {error && (
        <div className="alert alert-error" role="alert">
          Couldn't save. {error}
        </div>
      )}
    </section>
  );
}
