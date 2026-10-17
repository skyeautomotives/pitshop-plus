// Bike or car workshop: chosen when registering, changeable in Settings.
export type VehicleType = "bike" | "car";

export const VEHICLE_TYPES: { id: VehicleType; label: string; hint: string }[] = [
  { id: "bike", label: "Bikes", hint: "Bikes and scooters" },
  { id: "car", label: "Cars", hint: "Cars, SUVs and vans" },
];

/** Example text for form boxes, matching the workshop's vehicles. */
export function vehicleExamples(type: VehicleType | null | undefined) {
  if (type === "bike")
    return {
      vehicleName: "e.g. Honda Activa 6G, Royal Enfield Classic 350",
      complaint: "e.g. Brake noise when stopping, chain noise, hard to start",
      billItem: "e.g. Engine oil changed",
    };
  if (type === "car")
    return {
      vehicleName: "e.g. Maruti Swift, Hyundai Creta",
      complaint: "e.g. AC not cooling, engine warning light on",
      billItem: "e.g. Brake pads replaced",
    };
  return {
    vehicleName: "e.g. Honda Activa 6G, Maruti Swift",
    complaint: "e.g. Brake noise when stopping, engine warning light on",
    billItem: "e.g. Brake pads replaced",
  };
}
