// Job card: the common jobs and problems ticked when a vehicle comes in.
// Ids are saved with the complaint; labels come from the language files (jobs.*).
import { t, type Key, type Lang } from "../i18n";
import en from "../i18n/en";
import type { VehicleType } from "./vehicleType";

export interface JobItem {
  id: string;
  label: string;
}

const BIKE = [
  "oil_level",
  "battery_rr",
  "rear_brake_chain",
  "gear_oil",
  "clutch_kick",
  "filters_plug",
  "head_bearing_fuel",
  "insulator_carb",
  "stand_greasing",
  "cone_key_fuse",
  "buzzer_horn",
  "front_wheel_bush",
  "speedometer",
  "swing_arm_bush",
  "chain_sprocket",
  "wheel_bearings",
  "cone_seal",
  "disc_fluid_mc",
  "caliper_greasing",
  "disc_pads",
  "cables_lights",
  "water_service",
  "tyre_tube",
];

const CAR = [
  "car_oil_fluids",
  "brakes",
  "car_tyres",
  "car_battery",
  "lights",
  "car_suspension_steering",
  "car_ac_heating",
  "car_belts_hoses",
  "car_wipers",
  "car_diagnostic",
  "car_road_test",
  "car_accessories",
  "car_ac",
];

/** The checklist for a workshop. Without a type yet, the bike and car lists together. */
export function jobList(type: VehicleType | null | undefined): JobItem[] {
  const ids = type === "bike" ? BIKE : type === "car" ? CAR : [...BIKE, ...CAR.filter((id) => !BIKE.includes(id))];
  return ids.map((id) => ({ id, label: jobLabel(id) }));
}

/** A job's label in the current language; ids from an older list still show something readable. */
export function jobLabel(id: string, lang?: Lang): string {
  return id in en.jobs ? t(`jobs.${id}` as Key, undefined, lang) : id.replace(/_/g, " ");
}

/** "Engine oil change / top up, Brakes. Rattle near the seat" */
export function complaintText(c: { jobs?: string[] | null; description: string }, lang?: Lang): string {
  const jobs = (c.jobs ?? []).map((id) => jobLabel(id, lang)).join(", ");
  const text = c.description.trim();
  if (!jobs) return text;
  return text ? `${jobs}. ${text}` : jobs;
}
