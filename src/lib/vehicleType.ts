import { t } from "../i18n";
// Bike or car workshop: chosen when registering, changeable in Settings.
export type VehicleType = "bike" | "car";

export const VEHICLE_TYPES: { id: VehicleType; readonly label: string; readonly hint: string }[] = [
  { id: "bike", get label() { return t("vehicleType.bikes"); }, get hint() { return t("vehicleType.bikesHint"); } },
  { id: "car", get label() { return t("vehicleType.cars"); }, get hint() { return t("vehicleType.carsHint"); } },
];

/** Example text for form boxes, matching the workshop's vehicles. */
export function vehicleExamples(type: VehicleType | null | undefined) {
  if (type === "bike")
    return { vehicleName: t("examples.bikeVehicle"), complaint: t("examples.bikeComplaint"), billItem: t("examples.bikeItem") };
  if (type === "car")
    return { vehicleName: t("examples.carVehicle"), complaint: t("examples.carComplaint"), billItem: t("examples.carItem") };
  return { vehicleName: t("examples.anyVehicle"), complaint: t("examples.anyComplaint"), billItem: t("examples.anyItem") };
}
