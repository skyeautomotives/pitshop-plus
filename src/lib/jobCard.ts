// Job card: the common jobs and problems ticked when a vehicle comes in.
// Ids are saved with the complaint; labels come from the language files (jobs.*).
import { t, type Key } from "../i18n";
import en from "../i18n/en";
import type { VehicleType } from "./vehicleType";

export interface JobItem {
  id: string;
  label: string;
}

const BIKE = [
  "oil_change",
  "oil_filter",
  "air_filter",
  "spark_plug",
  "brakes",
  "chain",
  "clutch",
  "accelerator",
  "tappet",
  "decarbon",
  "battery",
  "lights",
  "horn",
  "steering",
  "tyre_pressure",
  "fasteners",
  "silencer",
  "belt",
  "wash",
  "starting_trouble",
  "noise",
  "low_mileage",
  "oil_leak",
];

const CAR = [
  "general_service",
  "oil_filter_change",
  "air_filter",
  "cabin_filter",
  "ac",
  "brakes",
  "alignment",
  "tyre_rotation",
  "battery",
  "clutch",
  "suspension",
  "steering",
  "coolant",
  "wipers",
  "lights",
  "electrical",
  "warning_light",
  "body",
  "wash",
  "starting_trouble",
  "noise",
  "oil_leak",
];

/** The checklist for a workshop. Without a type yet, the bike and car lists together. */
export function jobList(type: VehicleType | null | undefined): JobItem[] {
  const ids = type === "bike" ? BIKE : type === "car" ? CAR : [...BIKE, ...CAR.filter((id) => !BIKE.includes(id))];
  return ids.map((id) => ({ id, label: jobLabel(id) }));
}

/** A job's label in the current language; ids from an older list still show something readable. */
export function jobLabel(id: string): string {
  return id in en.jobs ? t(`jobs.${id}` as Key) : id.replace(/_/g, " ");
}

/** "Engine oil change / top up, Brakes. Rattle near the seat" */
export function complaintText(c: { jobs?: string[] | null; description: string }): string {
  const jobs = (c.jobs ?? []).map(jobLabel).join(", ");
  const text = c.description.trim();
  if (!jobs) return text;
  return text ? `${jobs}. ${text}` : jobs;
}
