// Job card: the common jobs and problems ticked when a vehicle comes in.
// Ids are saved with the complaint; labels can change (or be translated) freely.
import type { VehicleType } from "./vehicleType";

export interface JobItem {
  id: string;
  label: string;
}

const BIKE: JobItem[] = [
  { id: "oil_change", label: "Engine oil change / top up" },
  { id: "oil_filter", label: "Engine oil filter replace" },
  { id: "air_filter", label: "Air filter clean / replace" },
  { id: "spark_plug", label: "Spark plug clean / replace" },
  { id: "brakes", label: "Brakes" },
  { id: "chain", label: "Drive chain clean & adjust" },
  { id: "clutch", label: "Clutch" },
  { id: "accelerator", label: "Accelerator cable" },
  { id: "tappet", label: "Tappet adjustment" },
  { id: "decarbon", label: "Cylinder head decarbonising" },
  { id: "battery", label: "Battery" },
  { id: "lights", label: "Lights & indicators" },
  { id: "horn", label: "Horn" },
  { id: "steering", label: "Steering" },
  { id: "tyre_pressure", label: "Tyre air pressure" },
  { id: "fasteners", label: "Check & tighten all fasteners" },
  { id: "silencer", label: "Silencer cleaning" },
  { id: "belt", label: "Belt drive (scooters)" },
  { id: "wash", label: "Washing & cleaning" },
  { id: "starting_trouble", label: "Starting trouble" },
  { id: "noise", label: "Unusual noise" },
  { id: "low_mileage", label: "Low mileage" },
  { id: "oil_leak", label: "Oil leak" },
];

const CAR: JobItem[] = [
  { id: "general_service", label: "General service" },
  { id: "oil_filter_change", label: "Engine oil & filter change" },
  { id: "air_filter", label: "Air filter clean / replace" },
  { id: "cabin_filter", label: "AC cabin filter" },
  { id: "ac", label: "AC not cooling / gas top up" },
  { id: "brakes", label: "Brakes" },
  { id: "alignment", label: "Wheel alignment & balancing" },
  { id: "tyre_rotation", label: "Tyre rotation" },
  { id: "battery", label: "Battery" },
  { id: "clutch", label: "Clutch" },
  { id: "suspension", label: "Suspension noise" },
  { id: "steering", label: "Steering" },
  { id: "coolant", label: "Coolant top up" },
  { id: "wipers", label: "Wipers & washer" },
  { id: "lights", label: "Lights & indicators" },
  { id: "electrical", label: "Electrical problem" },
  { id: "warning_light", label: "Engine warning light" },
  { id: "body", label: "Dent & paint" },
  { id: "wash", label: "Washing & cleaning" },
  { id: "starting_trouble", label: "Starting trouble" },
  { id: "noise", label: "Unusual noise" },
  { id: "oil_leak", label: "Oil leak" },
];

/** The checklist for a workshop. Without a type yet, the bike and car lists together. */
export function jobList(type: VehicleType | null | undefined): JobItem[] {
  if (type === "bike") return BIKE;
  if (type === "car") return CAR;
  const seen = new Set(BIKE.map((j) => j.id));
  return [...BIKE, ...CAR.filter((j) => !seen.has(j.id))];
}

const LABELS = new Map<string, string>([...CAR, ...BIKE].map((j) => [j.id, j.label]));

/** A job's label; ids from an older list still show something readable. */
export function jobLabel(id: string): string {
  return LABELS.get(id) ?? id.replace(/_/g, " ");
}

/** "Engine oil change / top up, Brakes front & rear. Rattle near the seat" */
export function complaintText(c: { jobs?: string[] | null; description: string }): string {
  const jobs = (c.jobs ?? []).map(jobLabel).join(", ");
  const text = c.description.trim();
  if (!jobs) return text;
  return text ? `${jobs}. ${text}` : jobs;
}
