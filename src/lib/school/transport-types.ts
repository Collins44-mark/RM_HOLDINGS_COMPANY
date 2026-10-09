export type TransportPeriod = "today" | "week" | "month" | "year" | "custom";

export type TransportCaps = {
  canView: boolean;
  canManageBuses: boolean;
  canManageDrivers: boolean;
  canManageRoutes: boolean;
  canRecordFuel: boolean;
  canRecordMaintenance: boolean;
  canViewExpenses: boolean;
  canManageStaff: boolean;
};

export type TransportBusRow = {
  id: string;
  registrationNumber: string;
  name: string;
  makeModel: string;
  capacity: number;
  modelYear: number | null;
  odometer: number;
  isActive: boolean;
  driverId: string | null;
  driverName: string;
  fuelCost: number;
  fuelLitres: number;
  maintenanceCost: number;
};

export type TransportDriverRow = {
  assignmentId: string;
  staffId: string;
  staffName: string;
  staffNumber: string;
  busId: string;
  busRegistration: string;
  isActive: boolean;
  startedOn: string;
};

export const TRANSPORT_BILLING_FREQUENCIES = ["MONTH", "TERM", "YEAR", "ONCE"] as const;
export type TransportBillingFrequency = (typeof TRANSPORT_BILLING_FREQUENCIES)[number];

export function parseTransportBillingFrequency(value: unknown): TransportBillingFrequency | null {
  const next = String(value ?? "").trim();
  return TRANSPORT_BILLING_FREQUENCIES.includes(next as TransportBillingFrequency)
    ? (next as TransportBillingFrequency)
    : null;
}

export function transportBillingFrequencyLabel(value: string | null | undefined) {
  if (value === "MONTH") return "Per month";
  if (value === "TERM") return "Per term";
  if (value === "YEAR") return "Per academic year";
  if (value === "ONCE") return "One time";
  return "Not configured";
}

export function isBillableTransportRoute(row: { isActive: boolean; price: number; billingFrequency: string | null }) {
  return row.isActive && row.price > 0 && Boolean(parseTransportBillingFrequency(row.billingFrequency));
}

export type TransportRouteOption = {
  id: string;
  name: string;
  price: number;
  billingFrequency: TransportBillingFrequency | null;
  isActive: boolean;
  billable: boolean;
};

export type StudentTransportAssignment = {
  id: string;
  routeId: string;
  routeName: string;
  fare: number;
  billingFrequency: string;
  status: "active" | "inactive";
  startedOn: string;
  endedOn: string;
  billingPeriod: string;
};

export type StudentTransportCharge = {
  id: string;
  routeName: string;
  amount: number;
  paid: number;
  outstanding: number;
  status: string;
  billingFrequency: string;
  billingPeriod: string;
  isActive: boolean;
};

export type StudentTransportWorkspace = {
  status: "not_enrolled" | "active" | "inactive";
  assignment: StudentTransportAssignment | null;
  history: StudentTransportAssignment[];
  charges: StudentTransportCharge[];
  payments: Array<{ id: string; amount: number; paymentDate: string; status: string; method: string; reference: string }>;
  outstanding: number;
  billed: number;
  collected: number;
  currentPeriod: string;
  routes: TransportRouteOption[];
  canManage: boolean;
};

export type TransportRouteRow = {
  id: string;
  name: string;
  details: string;
  price: number;
  billingFrequency: TransportBillingFrequency | null;
  busId: string | null;
  busRegistration: string;
  driverName: string;
  isActive: boolean;
};

export type TransportFuelRow = {
  id: string;
  busId: string;
  busRegistration: string;
  recordedOn: string;
  litres: number;
  unitPrice: number;
  totalAmount: number;
  odometer: number | null;
  station: string;
  reference: string;
  notes: string;
};

export type TransportMaintenanceRow = {
  id: string;
  busId: string;
  busRegistration: string;
  recordedOn: string;
  odometer: number | null;
  provider: string;
  workPerformed: string;
  parts: string;
  cost: number;
  reference: string;
  notes: string;
};

export type TransportRecentService = {
  id: string;
  kind: "fuel" | "maintenance";
  recordedOn: string;
  busRegistration: string;
  description: string;
  cost: number;
};

export type TransportSummary = {
  activeBuses: number;
  drivers: number;
  activeRoutes: number;
  fuelCost: number;
  fuelLitres: number;
  maintenanceCost: number;
  otherTransportCost: number;
  totalTransportCost: number;
};

export type TransportStaffOption = {
  id: string;
  name: string;
  staffNumber: string;
};

export type TransportBusOption = {
  id: string;
  registrationNumber: string;
  name: string;
  isActive: boolean;
};

export function staffDisplayName(row: { first_name?: unknown; middle_name?: unknown; last_name?: unknown }) {
  return [row.first_name, row.middle_name, row.last_name]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function transportPeriodBounds(period: TransportPeriod, from?: string, to?: string) {
  const today = new Date();
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  if (period === "custom" && from && to) return { from, to };
  if (period === "today") {
    const day = iso(today);
    return { from: day, to: day };
  }
  if (period === "week") {
    const start = new Date(today);
    const weekday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - weekday);
    return { from: iso(start), to: iso(today) };
  }
  if (period === "year") {
    return { from: `${today.getUTCFullYear()}-01-01`, to: iso(today) };
  }
  const monthStart = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { from: monthStart, to: iso(today) };
}
