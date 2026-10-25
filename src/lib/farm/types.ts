import type { PageMeta } from "@/lib/pagination";
import type { FarmFinanceSummary } from "@/lib/farm/accounting";

export type FarmTractorStatus = "AVAILABLE" | "IN_USE" | "UNDER_SERVICE" | "INACTIVE";
export type FarmJobStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type FarmPartyKind = "CUSTOMER" | "SUPPLIER" | "BOTH";

export type FarmCaps = {
  canTractors: boolean;
  canJobs: boolean;
  canFuel: boolean;
  canMaintenance: boolean;
  canOperations: boolean;
  canFinance: boolean;
  canExpense: boolean;
  canReports: boolean;
  canSettings: boolean;
  canParties: boolean;
  canStaff: boolean;
};

export type FarmTractor = {
  id: string;
  code: string;
  name: string;
  registrationNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  acquiredOn: string | null;
  acquisitionCost: number | null;
  status: FarmTractorStatus;
  hourMeter: number;
  fuelLitres: number;
  notes: string | null;
  isActive: boolean;
};

export type FarmParty = {
  id: string;
  number: string;
  kind: FarmPartyKind;
  name: string;
  phone: string | null;
  notes: string | null;
  payments?: Array<{ id: string; amount: number; occurredOn?: string; method?: string; reference?: string | null }>;
};

export type FarmStaff = {
  id: string;
  number: string;
  name: string;
  phone: string | null;
  role: string;
};

export type FarmServiceType = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type FarmJob = {
  id: string;
  number: string;
  partyId: string;
  partyName: string;
  location: string | null;
  serviceTypeId: string;
  serviceName: string;
  tractorId: string | null;
  tractorName: string | null;
  operatorId: string | null;
  occurredOn: string;
  completedOn: string | null;
  areaHa: number | null;
  agreedPrice: number;
  amountPaid: number;
  status: FarmJobStatus;
  notes: string | null;
  payments?: Array<{ id: string; amount: number; occurredOn?: string; method?: string; reference?: string | null }>;
};

export type FarmFuel = {
  id: string;
  number: string;
  tractorId: string;
  tractorName: string;
  occurredOn: string;
  litres: number;
  unitPrice: number;
  totalCost: number;
  stationName: string | null;
  notes: string | null;
  payments?: Array<{ id: string; amount: number; occurredOn?: string; method?: string; reference?: string | null }>;
};

export type FarmMaintenance = {
  id: string;
  number: string;
  tractorId: string;
  tractorName: string;
  occurredOn: string;
  category: string;
  description: string;
  partsCost: number;
  labourCost: number;
  totalCost: number;
};

export type FarmExpense = {
  id: string;
  number: string;
  kind: string;
  occurredOn: string;
  amount: number;
  notes: string | null;
  sourceType: string;
};

export type FarmPlot = {
  id: string;
  number: string;
  name: string;
  hectares: number | null;
  crop: string | null;
};

export type FarmSeason = {
  id: string;
  number: string;
  plotId: string;
  plotName: string;
  name: string;
  year: number;
  crop: string | null;
};

export type FarmOperation = {
  id: string;
  number: string;
  plotName: string | null;
  seasonName: string | null;
  tractorName: string | null;
  activity: string;
  occurredOn: string;
  areaHa: number | null;
  cost: number;
};

export type FarmHarvest = {
  id: string;
  number: string;
  seasonName: string;
  quantity: number;
  unit: string;
  harvestedOn: string;
};

export type FarmActivityRow = {
  id: string;
  occurredOn: string;
  tractorName: string;
  kind: "FUEL" | "MAINTENANCE";
  detail: string;
  amount: number;
};

export type FarmListPage = PageMeta;
export type FarmSummary = FarmFinanceSummary;
