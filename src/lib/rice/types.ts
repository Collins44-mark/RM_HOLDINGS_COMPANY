export type RiceItemKind = "PADDY" | "RICE" | "BROKEN" | "BYPRODUCT";
export type RicePartyKind = "SUPPLIER" | "CUSTOMER" | "BOTH";
export type RicePaymentMethod = "CASH" | "MOBILE_MONEY" | "BANK" | "CREDIT";

export type RiceItem = {
  id: string;
  code: string;
  name: string;
  kind: RiceItemKind;
  sortOrder: number;
  isActive: boolean;
  qtyKg: number;
  valueTzs: number;
};

export type RiceParty = {
  id: string;
  partyNumber: string;
  kind: RicePartyKind;
  name: string;
  phone: string | null;
};

export type RicePurchase = {
  id: string;
  number: string;
  occurredOn: string;
  partyName: string;
  itemName: string;
  bags: number | null;
  qtyKg: number;
  unitPrice: number;
  total: number;
  paid: number;
  balance: number;
  method: string | null;
  reference: string | null;
  notes: string | null;
};

export type RiceMillOutput = {
  itemId: string;
  itemName: string;
  qtyKg: number;
};

export type RiceMillBatch = {
  id: string;
  number: string;
  producedOn: string;
  machine: string | null;
  shift: string | null;
  inputQtyKg: number;
  wastageKg: number;
  processingCost: number;
  notes: string | null;
  outputs: RiceMillOutput[];
};

export type RiceStockMovement = {
  id: string;
  occurredOn: string;
  itemName: string;
  sourceType: string;
  qtyKg: number;
  notes: string | null;
};

export type RiceSale = {
  id: string;
  number: string;
  occurredOn: string;
  partyName: string;
  total: number;
  paid: number;
  balance: number;
  method: string | null;
  dispatchOn: string | null;
  dispatchQtyKg: number | null;
  notes: string | null;
  lines: { itemName: string; qtyKg: number; unitPrice: number; lineTotal: number }[];
};

export type RiceStorageAccount = {
  id: string;
  accountNumber: string;
  partyId: string;
  partyName: string;
  phone: string | null;
  qtyKg: number;
};

export type RiceStorageMovement = {
  id: string;
  occurredOn: string;
  accountNumber: string;
  partyName: string;
  type: "DEPOSIT" | "RELEASE";
  bags: number | null;
  qtyKg: number;
  reference: string | null;
  notes: string | null;
};

export type RiceServiceIncome = {
  id: string;
  number: string;
  occurredOn: string;
  kind: string;
  amount: number;
  partyName: string | null;
  notes: string | null;
};

export type RiceExpense = {
  id: string;
  number: string;
  occurredOn: string;
  kind: string;
  amount: number;
  notes: string | null;
};

export type RiceFinanceSummary = {
  purchasesTotal: number;
  purchasePaid: number;
  payables: number;
  salesTotal: number;
  salePaid: number;
  receivables: number;
  serviceIncome: number;
  expenses: number;
  cogs: number;
  productionLoss: number;
  inventoryValue: number;
  netProfit: number;
};

export type RiceCaps = {
  canPurchase: boolean;
  canMill: boolean;
  canWarehouse: boolean;
  canAdjust: boolean;
  canStorage: boolean;
  canSell: boolean;
  canFinance: boolean;
  canExpense: boolean;
  canReports: boolean;
  canSettings: boolean;
};
