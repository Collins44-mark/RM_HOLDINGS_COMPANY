export const HIVE_TYPES = ["Traditional", "Top Bar", "Langstroth", "Other"] as const;
export const HIVE_STATUSES = ["Active", "Empty", "Inactive", "Maintenance"] as const;
export const HARVEST_QUALITIES = ["Premium", "Good", "Standard", "Not Graded"] as const;
export const EXPENSE_CATEGORIES = [
  "Beehive Purchase",
  "Hive Maintenance",
  "Protective Equipment",
  "Smoker and Tools",
  "Transportation",
  "Harvesting Equipment",
  "Packaging",
  "Labour",
  "Apiary Maintenance",
  "Other",
] as const;
export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Mobile Money"] as const;

export function businessToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function roundKg(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
