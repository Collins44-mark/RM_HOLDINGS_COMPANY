import { centsToMoney, moneyToCents } from "@/lib/supermarket/money";

export type ReconciliationStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "VOID";
export type BankMatchStatus = "UNMATCHED" | "MATCHED" | "MANUALLY_MATCHED" | "EXCLUDED";
export type BankTxnSource = "STATEMENT" | "SYSTEM";

export type ReconciliationCapabilities = {
  canView: boolean;
  canCreate: boolean;
  canApprove: boolean;
  canPost: boolean;
  isOwner: boolean;
  userId: string;
  sodReconciliation: boolean;
};

export type PaymentBreakdown = {
  cash: string;
  card: string;
  mobile: string;
  other: string;
  total: string;
};

export type SalesReconciliationRecord = {
  id: string;
  reconciliationDate: string;
  periodStart: string;
  periodEnd: string;
  expected: PaymentBreakdown;
  expectedSales: string;
  unpaidCredit: string;
  actual: PaymentBreakdown;
  variance: string;
  varianceReason: string;
  notes: string;
  status: ReconciliationStatus;
  preparedBy: string | null;
  approvedBy: string | null;
  preparedAt: string | null;
  approvedAt: string | null;
};

export type CashReconciliationRecord = {
  id: string;
  reconciliationDate: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: string;
  cashIn: string;
  cashOut: string;
  expectedClosing: string;
  actualCounted: string;
  variance: string;
  varianceReason: string;
  notes: string;
  status: ReconciliationStatus;
  preparedBy: string | null;
  approvedBy: string | null;
};

export type StockReconciliationHeader = {
  id: string;
  stocktakeDate: string;
  categoryId: string | null;
  notes: string;
  status: ReconciliationStatus;
  varianceCount: number;
  varianceValue: string;
  preparedBy: string | null;
  approvedBy: string | null;
  postedAt: string | null;
};

export type StockReconciliationItem = {
  id: string | null;
  productId: string;
  name: string;
  sku: string;
  systemQty: number;
  physicalQty: number | null;
  varianceQty: number;
  unitCost: string;
  varianceValue: string;
  reason: string;
  notes: string;
  postedAdjustmentId: string | null;
};

export type BankAccountRecord = {
  id: string;
  bankName: string;
  accountName: string;
  accountReference: string;
  openingBalance: string;
  isActive: boolean;
};

export type BankTransactionRecord = {
  id: string;
  bankAccountId: string;
  transactionDate: string;
  reference: string;
  description: string;
  debit: string;
  credit: string;
  amount: string;
  source: BankTxnSource;
  externalReference: string;
  status: BankMatchStatus;
};

export type BankReconciliationRecord = {
  id: string;
  bankAccountId: string;
  statementStart: string;
  statementEnd: string;
  statementOpeningBalance: string;
  statementClosingBalance: string;
  systemClosingBalance: string;
  difference: string;
  unmatchedCount: number;
  notes: string;
  status: ReconciliationStatus;
  preparedBy: string | null;
  approvedBy: string | null;
};

export type ReconciliationOverviewCard = {
  kind: "sales" | "cash" | "stock" | "bank";
  href: string;
  title: string;
  statusLabel: string;
  detail: string;
  tone: "neutral" | "ok" | "variance";
};

export function todayInDarEsSalaam() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam" }).format(new Date());
}

export function periodBounds(from: string, to: string) {
  return {
    fromIso: `${from}T00:00:00+03:00`,
    toIso: `${to}T23:59:59.999+03:00`,
  };
}

export function displayStatus(status: ReconciliationStatus | null | undefined, varianceCents: number) {
  if (!status) return { label: "Not Reconciled", tone: "neutral" as const };
  if (status === "VOID") return { label: "Void", tone: "neutral" as const };
  if (status === "POSTED") return { label: "Posted ✓", tone: "ok" as const };
  if (status === "APPROVED") {
    return varianceCents === 0
      ? { label: "Balanced", tone: "ok" as const }
      : { label: "Variance", tone: "variance" as const };
  }
  if (status === "SUBMITTED") return { label: "Submitted", tone: "neutral" as const };
  return { label: "Not Reconciled", tone: "neutral" as const };
}

export function classifyPaymentMethod(method: string): keyof Omit<PaymentBreakdown, "total"> {
  if (method === "CASH") return "cash";
  if (method === "CARD") return "card";
  if (method === "MOBILE_MONEY") return "mobile";
  return "other";
}

export function emptyBreakdown(): PaymentBreakdown {
  return { cash: "0.00", card: "0.00", mobile: "0.00", other: "0.00", total: "0.00" };
}

export function breakdownFromCents(cents: {
  cash: number;
  card: number;
  mobile: number;
  other: number;
}): PaymentBreakdown {
  const total = cents.cash + cents.card + cents.mobile + cents.other;
  return {
    cash: centsToMoney(cents.cash),
    card: centsToMoney(cents.card),
    mobile: centsToMoney(cents.mobile),
    other: centsToMoney(cents.other),
    total: centsToMoney(total),
  };
}

export function moneyOrZero(value: unknown) {
  return centsToMoney(moneyToCents(value));
}
