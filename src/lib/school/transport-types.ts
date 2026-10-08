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

export type TransportRouteRow = {
  id: string;
  name: string;
  details: string;
  price: number;
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
