import type { SchoolPageMeta } from "@/lib/school/pagination";

export const SCHOOL_STORE_CATEGORIES = ["UNIFORM", "STATIONERY", "EQUIPMENT"] as const;
export type SchoolStoreCategory = (typeof SCHOOL_STORE_CATEGORIES)[number];

export const SCHOOL_STORE_VIEWS = ["overview", "items", "sales", "transactions"] as const;
export type SchoolStoreView = (typeof SCHOOL_STORE_VIEWS)[number];

export type SchoolStoreCaps = {
  canView: boolean;
  canManage: boolean;
  canSell: boolean;
  canIssue: boolean;
  canRecordPayment: boolean;
};

export type SchoolStoreItem = {
  id: string;
  sku: string;
  name: string;
  category: SchoolStoreCategory;
  unit: string;
  variant: string;
  purchaseCost: number;
  sellingPrice: number;
  avgUnitCost: number;
  qtyOnHand: number;
  qtyInCustody: number;
  lowStock: number;
  isDurable: boolean;
  isActive: boolean;
  stockValue: number;
};

export type SchoolStoreStudentOption = {
  id: string;
  enrollmentId: string;
  studentNumber: string;
  name: string;
};

export type SchoolStoreSale = {
  id: string;
  saleNumber: string;
  saleDate: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  enrollmentId: string;
  chargeId: string;
  subtotal: number;
  paidAmount: number;
  outstanding: number;
  status: "outstanding" | "partial" | "paid";
  isActive: boolean;
};

export type SchoolStoreMovement = {
  id: string;
  occurredOn: string;
  movementType: string;
  itemName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  supplier: string;
  recipient: string;
  location: string;
  notes: string;
  reference: string;
};

export type SchoolStoreSummary = {
  itemCount: number;
  lowStockCount: number;
  stockValue: number;
  salesTotal: number;
  collected: number;
  outstanding: number;
};

export type SchoolStoreWorkspace = {
  view: SchoolStoreView;
  items: SchoolStoreItem[];
  sales: SchoolStoreSale[];
  movements: SchoolStoreMovement[];
  summary: SchoolStoreSummary;
  page: SchoolPageMeta;
  q: string;
  category: string;
  capabilities: SchoolStoreCaps;
};

export function parseSchoolStoreView(value: string | null | undefined): SchoolStoreView {
  return SCHOOL_STORE_VIEWS.includes(value as SchoolStoreView) ? (value as SchoolStoreView) : "overview";
}

export function parseSchoolStoreCategory(value: string | null | undefined): SchoolStoreCategory | null {
  return SCHOOL_STORE_CATEGORIES.includes(value as SchoolStoreCategory) ? (value as SchoolStoreCategory) : null;
}

export function schoolStoreCategoryLabel(category: string) {
  if (category === "UNIFORM") return "Uniform";
  if (category === "STATIONERY") return "Stationery";
  if (category === "EQUIPMENT") return "Equipment";
  return category;
}

export function schoolStoreMovementLabel(type: string) {
  if (type === "RECEIVE") return "Received";
  if (type === "SALE") return "Sold";
  if (type === "ISSUE") return "Issued for school use";
  if (type === "CUSTODY") return "Issued (custody)";
  if (type === "ADJUST") return "Adjusted";
  if (type === "REVERSE") return "Reversed";
  return type;
}

export type SchoolEmergencyFundEntry = {
  id: string;
  kind: "OPENING" | "REPLENISH" | "SPEND";
  amount: number;
  occurredOn: string;
  reference: string;
  notes: string;
  expenseId: string | null;
  isActive: boolean;
  recordedBy: string;
};

export type SchoolEmergencyFund = {
  balance: number;
  opening: number;
  replenished: number;
  spent: number;
  hasOpening: boolean;
  entries: SchoolEmergencyFundEntry[];
  canManage: boolean;
};
